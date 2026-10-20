# Location spec: The Arcade (game hall)

**Status:** IMPLEMENTED (see "What was built" at the end for where the build differs). Everything is **PROPOSED** unless it is in "Decided". Numbers are starting points; they are not tuned
(principle 2). The internal id is `gamehall`; "arcade" is the word in prose. (`arcade` is already a street type, and the hub
has an "arcade" variant, so the id stays out of their way.)

## 0. Decided

- **Concept:** an arcade, to exercise a new **Gaming** skill (author-approved after the review pitch).
- **Skill:** `gaming`, in a **new `tech` group** (the author asked for a tech group; there was none). It gets a line in the
  Ghost branch ("Stealth and tech"), spills a little into `calculate`, `perception`, `tinkering` and `throwing`, and
  feeds the weighted geometric mean like any other skill. It is not wired into fights.
- **Muse, as flavour only.** Neo's entertainment conglomerate (see §2 and the note at the end) makes the licensed machines.
  **Every cabinet is either a Muse-approved Entertainment Cabinet or an illegal bootleg.** There is **no Atlas** in the
  arcade. Muse's music-industry machinery (Clearance, A&R scouts, noise drones, Inspiration teams, pirate towers) is **not** used here: it belongs to the
  guitar work and makes no sense applied to games.
- **The spider.** Instead, a **compliance robot** (a horrifying, cheerful spider) now and then enters an arcade to verify
  compliance, and tries to destroy any bootleg machine it finds, calling out "Fun guaranteed!" in the meantime.
- **Shape:** a **lot**, with rooms. About one per twelve streets.
- **Pronouns, tone, hard rules:** as in the setting bible. The spider destroys machines, not people.

## 1. How the three principles shape this spec

| Principle | In practice |
|---|---|
| Maximalism | An arcade is rolled from 12 variants × 14 shells × 5 sizes × 5 conditions × 5 tiers × ~40 traits × ~18 situations × 9 wild cards, plus 10 room kinds and ~55 features. Every cabinet in it is rolled again: a genre (12), a game (about 8 titles per genre per side), and whether it is Muse or bootleg. Two halls rarely match. |
| Unbalanced | Wild cards break rules on purpose (a cabinet that has never lost, a haunted high-score table, a hall the spider cannot enter, a cabinet that pays real cash). Nothing is clamped. The limits are the world's: a cash box is finite, a high score is a number someone really has, a cabinet the spider has stamped on stays broken for days, and the spider has a leg for every one of them. |
| Multidimensional | Every skill, stat and drive has a row somewhere (the coverage test). `gaming` is only one of them. The rows read the same odds machinery as the gym and the pawn shop and never name a class. |

## 2. Concept

Neo sells play by the credit, and the credit is a subscription. In the arcade the machines are rows of coloured light
that make a noise every eleven seconds, and **every one of them is one of two things**. **Muse-approved Entertainment
Cabinets** are licensed, warm and sparkly: LUMINA smiles on the attract screen ("LUMINA 6.2: now with more feelings"), the tokens are
"Joy Credits", the scores are uploaded to friends, and a gentle voice says "fun guaranteed" between every game. **Bootleg
cabinets** are cracked boards in stolen cases, with no attract screen, a menu in six languages, a leaderboard that is
whatever someone typed, harder, weirder and cheaper, and illegal.

For a gamer the arcade is a ladder and a rival. For a hustler it is a hustle. For a thief it is a hundred small cash boxes
and a back room of cracked boards. For a tinkerer it is the open back of a cabinet. For a hacker it is a debug menu. For
a flirt it is the two-player stick and a person at the other one. And now and then, all of it stops, because
**a spider walks in**: eight jointed legs, a smiling face on a screen where the head should be, a cheerful voice saying
"Fun is guaranteed! Please remain enjoyed!", and a pair of pincers that go through a bootleg cabinet like it was a
biscuit. It is not malicious. It has a checklist.

Muse is wallpaper here: the logo on every screen, a licence frame on the wall, a sticker that says FUN VERIFIED, a
"Joy+" pass. There is nothing from Atlas in the room, which is the one thing about it that is peaceful.

## 3. Placement

- **Role / kind:** `GenRole 'gamehall'` and `'gamehallroom'`; `Location.kind 'gamehall'` for both.
- **Own random streams:** `gamehallchance:${worldSeed}:${streetId}` for whether a street has one, `gamehall:${worldSeed}:${id}`
  for the roll, `cab:${worldSeed}:${id}:${key}` for each cabinet. The slot is added **after the chop shop's and the hub's**,
  after everything else on the street, so **no existing map changes** and `LOTS` is untouched.
- **Chance a street has one (`HALL_CHANCE`):** nightlife 0.12 · market 0.10 · tenement 0.07 · slum 0.06 · corporate 0.05 ·
  industrial 0.04 (about 1 in 12).
- **Variant weights by district** (`HALL_VARIANT`): nightlife loves rhythm, dojo and vr; market loves claw, retro and
  skillgames; corporate loves the Muse flagship; slum and tenement love bootleg, backroom and retro; industrial loves racing
  and pinball.
- **Security, crowd, faction:** security from variant + shell + condition + traits; faction `v:<id>` (a venue faction), so
  killing the owner shuts the hall.

## 4. A hall is a point in a space

Rolled once, from the hall's own stream, and stored on `Location.gamehall`. Axes are independent: incoherent halls are the
good ones.

- **Variant (12):** what it mostly is. Each has 11 names, 3 blurbs, 2 wall lines, a price per play, how bootleg it is, and
  how often the spider calls.
  **Muse Joy Hall** (a flagship, all licensed) · **licensed hall** (an independent with the licence on the door) ·
  **bootleg den** (all cracked) · **front and back** (licensed front, bootleg back room) · **fighting-game dojo** ·
  **rhythm floor** · **pinball parlour** · **racing bays** · **claw and prize counter** · **VR booths** ·
  **retro bar** (old cabinets and drinks, all technically illegal) · **skill games** (cabinets that pay out in cash).
- **Shell (14):** a dead cinema foyer · a ferry terminal · a laundromat's back half · a bowling alley · a tram depot · a
  shipping container · a pedestrian underpass · a car-park level · a gutted department-store floor · a church hall · a drained
  swimming bath · a dead shopping-mall wing · a noodle bar's upstairs · a bus station.
- **Size** (closet, small, medium, large, sprawl), **condition** (derelict .. immaculate), **tier 1-5** (how good the machines,
  prizes and champion are; independent of everything else).
- **Traits (0-3 of ~40):** *ownership* a Muse "Joy Partner" · family-run · run by a retired champion · a collective · an
  influencer's hall · squatted · a gang's front; *tone* neon-drowned · a "no phones" rule · sticky floors · CRT-only ·
  sponsored by a fizzy drink · a Saturday birthday party that never ends · a silent hall; *access* tokens only · a hall
  card · "Joy+" members only · free play · cash only · a password; *scene* a record was set here · a rival hall opposite · a
  resident champion · a tournament circuit stop · a regulars' cult · a streamer's home hall · a bootleggers' dead drop;
  *kit* a stream rig · a four-seat sit-down cabinet · a graveyard of retired cabinets · one pinball nobody can fix · a vault
  of prizes · a sticker wall of FUN VERIFIED · a hidden door · an "auditor's fee" jar; *quirks* the owner remembers every
  score · emoji labels · a cat · cabinets numbered, not named · popcorn · everything costs 7nd. They may contradict.
- **Situation (0-1, a pure function of the clock, ~18):** tournament night · free play · a power cut · a league final · a
  streamer visit · a LUMINA launch · a rumoured bootleg raid · a birthday party · a token shortage · someone three points from
  the record · a service day · a lunch rush · a late-night crowd · a rival crew camping the champion's cabinet · glitch day ·
  Joy Week · a cabinet swap · a quiet afternoon.
- **The audit** is not a situation but a second clock-driven thing: on some days, for an hour or so, **the spider is here**.
  Pure function of the clock (see §8).
- **Wild cards (about 1 in 12, 9):** the cabinet that has never lost · the haunted high-score table · every cabinet is rigged
  · a cabinet that pays real cash · the leaderboard lists Blackbird from a run she has not had yet · a hall the spider
  cannot enter (everything is bootleg, the licence is a drawing) · a hall where the spider lives · every cabinet is the same
  game · a sentient cabinet.

## 5. Rooms and features

- **Rooms (10),** each optional: **office** (the owner; licence frame, cash box) · **back room** (the bootleg den; hidden, often
  gated) · **workshop** (a cabinet's guts on a bench) · **stage** (a tournament stage) · **lounge** (snacks and couches) ·
  **cashroom** (the token vault) · **cellar** (retired cabinets) · **roof** · **crawlspace** · **back alley**.
- **Cabinets (12 genres),** each a feature: brawler (versus fighting) · racer · rhythm · light-gun shooter · puzzle · pinball ·
  claw · VR booth · scroller (a co-op beat 'em up) · sports · mecha (a sit-down sim) · skill game (pays out).
  Each is **Muse** or **bootleg**, per cabinet, with a title. Muse titles are sparkly ("LUMINA's Dance Party Deluxe 6.2",
  "Pawsome Racers"). Bootleg titles are not ("Fist of Static", "Gutter Racers", "DEAD PIXEL").
- **Other features (~45):** the token booth, prize counter, ticket shredder, scoreboard, LUMINA screen, licence frame,
  sticker sheet, notice board, vending machine, snack bar, couch, jukebox, photo booth, CCTV console, cash box, safe,
  repair bench, parts bin, cabinet guts, cable run, stage screen, tournament bracket, dance pad, arcade cat, tip jar, stream
  rig, queue rope, cabinet graveyard, password door, mirror ball, side door, skylight, vent grille, hatch, bin fire...

## 6. People

Archetypes cast by room and variant: **hall_owner** (killing the owner shuts the hall), **hall_attendant** (token booth),
**hall_tech** (the workshop), **hall_guard**, **hall_regular** (ephemeral players), **hall_champion** (the resident best;
a trainer-equivalent), **hall_hustler** (side bets), **hall_streamer**, **hall_bootlegger** (the back room), **hall_host** (a Muse
"Joy Host" in flagships), and the **muse_spider**. Plus reused `ganger`, `cop`, `street_kid` (adults, TONE.md).

## 7. Affordances: what each capability sees

The row schema is `affordances.ts`'s. Rows with real state use the kit's stateful actions: **play** a cabinet, **jailbreak**
a Muse cabinet into a bootleg, **forge** a licence onto a bootleg, **hide** a cabinet from the spider, **lift** a board.
Target 80+ rows across `hallafford.ts` (play, craft, the crowd), `hallcrime.ts` (stealth and the dark side) and
`hallevents.ts` (situations, wild cards, the spider, variant-only).

| Capability (open set) | Sees | Does |
|---|---|---|
| **gaming, reflex** | a cabinet and a leaderboard | Play for a score; climb the board; beat the champion; enter the tournament |
| **calculate, analyze, perception, int** | puzzle cabinets, a pattern, the spider's checklist | Solve a cabinet; read a champion's tell; learn the spider's route |
| **marksmanship, throwing, athletics** | the light-gun cabinet, the sports cabinet, the VR booth | Shoot a high score; sink a hoop; sweat in the booth |
| **driving, tinkering** | the racing bay, a cabinet's guts | Race; fix a cabinet for pay; rewire a stick; swap a board |
| **music, dancing, singing, beatbox, guitar, djing** | the rhythm cabinet, the dance pad, the stage | Clear a song; dance for a crowd; do a halftime show |
| **romance, charm, persuasion** | the two-player stick, the claw machine, the lounge | Win a prize for someone; flirt over a co-op game; talk the owner into a deal |
| **haggling, hustling, cards, grifting, streetwise** | the token booth, a side bet, the prize counter | Haggle tokens; run a bet; hustle a mark; work the claw; sell a tip |
| **sleight, lockpicking, sneak** | the cash box, the cashroom, the prize case | Lift tokens; crack the cash box; slip into the back room |
| **hack (a debug menu), int** | a cabinet's service menu, the scoreboard | Free play; edit the board; jailbreak a cabinet; make a licensed cabinet bootleg |
| **art, tinkering** | the sticker sheet, the licence frame | Forge a FUN VERIFIED sticker; paint a cabinet |
| **melee, muscle, intimidation, bravery** | the champion, a sore loser, the spider | Throw a rival out; shut a brawl; take the spider on |
| **scavenging, tracking** | the cabinet graveyard, a wrecked cabinet | Strip a wreck for boards; find where the bootleggers went |
| **rapport** | the arcade cat, the spider | Befriend the cat; befriend a spider |
| **mixology, cooking, tolerance, medicine** | the snack bar, the vending machine, a sore thumb | Work the snack bar; drink a dare; patch a cramped hand |
| **curiosity, quest (drive)** | the secret level, the unbeaten cabinet | Find the code; beat the cabinet that never loses |
| **pride, lust, thirst, greed (drive)** | the scoreboard, the two-player stick, the vending machine, the cash box | Be on the board; flirt; a fizzy drink; take it |
| **implants, items, kill goal** | a visor, a dongle, the owner, the spider | Use a visor; a debug dongle opens a service menu; murder the owner (shuts the hall); kill the spider |
| *(your next capability goes here)* | | |

**Wild cards** (one row or modifier each): a cabinet that has never lost (a boss with a 1% line); the haunted board (a ghost
holds every record; beating it is its own fame); every cabinet rigged (every loss costs her more; wins pay double); the
cash cabinet (a skill game pays in real cash and never runs out); the future score (the board shows Blackbird at #1, from
tomorrow); the spider cannot come; the spider lives here; one game in every cabinet; a sentient cabinet.

## 8. Systems

- **Cabinets are state on the hall.** `Location.cabs` is a map from `"room:feature"` to what has been done to that
  cabinet. A cabinet is created, with its genre, title and licence, from the hall's seed the first time it is looked at, so an
  old save grows them. Only deviations are stored: a **licence override** (jailbroken or forged), the **high score** and who
  holds it, **wrecked until** a clock minute, **hidden until** a clock minute. Everything else is a pure function of the
  seed.
- **Play** costs a few nd and rolls on `gaming` and a genre's other skills; a result is a **new record** (her name goes on
  the board, with fame and a purse), a **respectable run** (XP, a few Joy tickets, or a cash payout at a bootleg), or **game
  over**. Muse cabinets are fair and steady (tickets, shared scores); bootleg cabinets are harder, stranger and pay in cash.
- **The audit.** A pure function of the clock: for each day a hall has a chance (by variant and traits) that the spider calls,
  at some hour for 40 to 100 world minutes. While it is here (and she is too), each beat it may stamp a bootleg cabinet to
  scrap, calling out "Fun guaranteed!"; a wrecked cabinet stays wrecked for 2 to 6 days, then the owner brings another (a new
  game, a new board, a blank leaderboard). Audits that finished while she was away have already happened: the hall catches
  up from its stamp when she next looks, the same way the pawn shop restocks. A **hidden** cabinet is passed over. A
  **forged** licence passes if the spider's checklist does not notice. A calm or bribed spider moves on.
- **The spider** is an NPC (`muse_spider`) spawned for the audit and gone after it. She can fight it (it is a machine:
  safe to blow up), hack it, charm it, trick it, feed it fun, or simply stay out of its way. Nothing it does hurts a person.
- **What limits it:** the cash box, the prize stock, the board (a real number someone really has), the wreck timer, the hour
  of the audit, and the owner's patience.

## 9. Setting texture and hard rules

- **Texture:** fee ✓ (Joy Credits, a Joy+ pass, an auditor's fee) · brand ✓ (Muse, LUMINA, Joy) · Atlas absent on purpose ·
  specific number ✓ (a score, a price in nd, a version).
- **Hard rules:** (1) Blackbird opposes Atlas; there is none here, so nothing to join. (2) Nothing grim: the spider smashes
  machines. (3) Punch up: Muse's cheerfulness and the spider's checklist are the joke, never the players or the poor.
  (4) Invented brands only; every title and hall name is grepped. (5) The owner, the champion and the staff have agency and
  can refuse her. (6) Adult, not explicit.

## 10. Engine touchpoints

| File | Change |
|---|---|
| `types.ts` | `GenRole` + `Location['kind']` gain `gamehall`, `gamehallroom`; `Location.gamehall?: HallInfo`, `hallRoom?`, `cabs?` |
| `content/skills.ts`, `content/tree.ts`, `content/lab` | the `gaming` skill and the `tech` group |
| `content/halls.ts` (new) | variants, shells, traits, situations, wild cards, rooms, features, cabinets and titles, `rollHall`, `hallRoster`, the audit clock |
| `hallkit.ts` (new) | the view, the cabinets, play / jailbreak / forge / hide, the audit tick |
| `content/hallafford.ts`, `hallcrime.ts`, `hallevents.ts` (new) | the rows |
| `hall.ts` (new) | candidates and `describeHall` |
| `mapgen.ts` | `HALL_CHANCE`, the `gamehallchance:` stream and the slot after the others', `sketch`, `expand`, BLURB/KIND/nameFor |
| `content/archetypes.ts`, `content/items.ts`, `roster.ts` | people, the spider, goods; a ROSTERS row |
| `combat.ts`, `shutdown.ts`, `stage.ts`, `clock.ts`, `run.ts`, `text.ts`, `grid.ts`, `hexmap.ts`, `hours.ts`, `layouts.ts`, `shapes.ts`, `interactions.ts` | hooks as the protocol lists |
| `scripts/halls.ts`, `scripts/coverage.ts`, `package.json` | `npm run halls`; coverage includes the hall |

## 11. Tests

`hall.test.ts`, after `pawn.test.ts`: determinism; tables only name things that exist; a wide space; district shaping; existing
maps unchanged; people are cast; every row's `where` names real things; coverage (every capability served); situations and
audits are pure functions of the clock; a forced run of every row; and the place-specific rules: a cabinet is Muse or
bootleg; a bootleg is wrecked by an audit and rebuilt later; a hidden one is passed over; a forged licence can pass; a
jailbreak changes a cabinet for good; a new record goes on the board; the owner dead shuts the hall; an old save with no
cabinets loads.

## 12. Coverage

Run `npm run coverage` after building; list thin spots in "What was built".

## 13. Open items

1. **Muse as a faction** (PROPOSED: none here). The spider is an NPC with no faction; Muse's presence is text. If the Muse
   work lands, the spider and the licence can hang off its faction without changing the rows.
2. **Does killing the spider cost anything?** (PROPOSED: no. A counter, `spiders_killed`, is kept; owners of bootleg dens are
   grateful, and a flagship's host is wounded in a way that is a very cheerful sort of wounded.)
3. **Gaming and fights** (PROPOSED: none).

## A note on Muse

Muse is an entertainment conglomerate that runs the channels and licenses fun. On the guitar branch it is a music-industry
antagonist (Clearance, scouts, drones, strike teams). Here it is only the **brand on the licensed cabinets** and the
voice of the spider: a warm influencer register ("We light up your world 🥰", "Fun guaranteed!") in the same breath as
a machine stamped flat. If that branch lands, the setting entry (`factions.md`) is the one to extend.

## 14. What was built (and where it differs from the draft)

Code: `content/halls.ts` (variants, shells, traits, situations, wild cards, rooms, features, the twelve cabinet genres and 96
titles, `rollHall`, `cabinetOf`, the audit clock `auditOnDay`, `hallRoster`), `content/hallplay.ts` (the words for playing each
genre on each side of the licence, and for jailbreak / forge / hide / strip / smash / redeem), `content/hallafford.ts` /
`hallcrime.ts` / `hallevents.ts` (the rows), `hallkit.ts` (the view, the cabinets, the audit catch-up, the spider, play,
jailbreak, forge, hide, strip, smash, tickets), `hall.ts` (candidates, registration, `describeHall`), plus hooks in
`mapgen.ts`, `roster.ts`, `combat.ts`, `shutdown.ts`, `stage.ts`, `interactions.ts`, `run.ts`, `clock.ts`, `hours.ts`,
`layouts.ts`, `shapes.ts`, `hexmap.ts`, `grid.ts`, `text.ts`, `types.ts` and `placekit.ts`; people and goods in
`content/archetypes.ts` (11 new, the spider among them) and `content/items.ts` (13 new). The skill is in `content/skills.ts`
(`gaming`, group `tech`) and `content/tree.ts` (the Ghost branch takes the `tech` group). Tooling: `npm run halls`, and
`npm run coverage` has a hall column. Tests: `hall.test.ts` (44).

What exists: 12 variants (11 names, 3 blurbs and 2 wall lines each), 14 shells, 5 sizes, 5 conditions, 5 tiers, 41 traits,
18 situations, 9 wild cards, 10 room kinds, 51 features (12 of them cabinets), 96 cabinet titles (48 Muse, 48 bootleg), and
151 rows (45 play, craft and crowd; 40 stealth and the dark side; 66 situations, spider, wild cards and variant-only). Every
skill, stat and drive has at least one row (the coverage test and `npm run coverage`).

Differences from the draft:

- **The spider is a clock-driven visitor, not a situation.** `auditOnDay` is a pure function of the seed and the day; the
  hall catches up on visits that ended while she was away (`ensureCabs`, flagged per day in `w.counters`), so a bootleg den
  she left for a week has been stamped on and rebuilt by the time she is back. While she is there, `tickHalls` spawns the
  spider (`spider:<hall>:<day>`), and each beat it may check the next cabinet on its list.
- **Only deviations are stored** (`Location.cabs`): a licence override, a forgery's quality, a score, `wrecked` and `hidden`
  as clock minutes, and a generation number. A rebuilt cabinet is a new game, a new licence roll and a blank board.
- **A changed cabinet is a different animal:** a jailbroken Muse cabinet keeps its title with "(cracked)" on it.
- **Fame goes through `fameFrom`** under the cause `arcade` (the stage's prestige is 0.8 for an arcade, 1.3 for its stage).
- **No hero state and no Muse faction.** The spider has no faction; its only mark on the world is `spiders_killed` and
  `cabs_wrecked` in `w.counters`.
- **Added after the spec:** `spidercalm:` and `spiderdead:` counters (a talked-down or killed spider cancels the visit,
  including the catch-up), `hallban:` for a hall that has barred her, and a quiet row that reads the spider's diary (it
  tells her when the next visit is due, from the clock itself).

Numbers to watch when tuning (all deliberately unbalanced): `bootChance` per variant (0 for the flagship, 1 for the den), the
price per play (`VARIANTS.*.play`, Muse costs 1.35x and bootlegs 0.65x), `champLevel` and `scoreOf` (how hard a board is and how
it reads), the odds in `playOne` (a record needs a win first, then 0.1 + 0.05 per point over half the top), the audit chance
(`VARIANTS.*.audit`, 0.12 to 0.5 a day), the 2-6 day rebuild, and the forgery's noticing curve in `noticed`.

Real runs (40 autonomous nights): 9 found an arcade, 4 did something in one, 3 played a cabinet, 1 met the spider (16
cabinets wrecked across the runs). The gym found 9 and used 4, the pawn shop 5 and 3, the hub 6 and 4, so the arcade sits
in the same band.

Thin spots: `gaming` has no row at the gym, the pawn shop or the hub (a console for hock, a lesson in the hub), and a few
skills have one row here (`pool`, `hijack`, `fishing`, `marksmanship` has two).

Still open: a goal that sends her back to an arcade for a record; pool tables (there is no pool table in the arcade, only
an air-hockey row); what the Muse faction does with the spider if the guitar work lands; whether a licensed cabinet can be
*restored* after a jailbreak (nothing does it today).

## 15. Games across Neo: liking, creators, and the gaming Callings

The arcade was where Gaming started. This is how it spread.

**Gaming at other places.** `content/gamerows.ts` adds 22 rows that lean on Gaming to the gym (a reaction lab, an esports
bootcamp, a VR sparring sim...), the pawn shop (a console to hock, a cartridge to flip, a bootleg to fence) and the hacker hub
(speed-runs, a ladder, a cabinet in the corner), and the Rusty Halo's laser-tag league takes a little help from it. The shared
check runner (`placekit.ts`) tallies the money a Gaming check wins as `earned` on its event, anywhere, which is what the
money Calling counts.

**A score for every game** (`games.ts`, `Mind.games`). A game is a title, the same on every cabinet that runs it. For each one
she has played she keeps: plays, wins, records, a losing streak, where she played it, and **how much she likes it** (-1 to 1).
A record or a win raises it; a loss lowers it, faster the longer the streak and the shorter her temper. Crossing +0.45 or -0.4
says so out loud once (`game_feeling`). It is her side only: it resets with her body, like her bonds.

**A wound.** If a Muse compliance spider stamps on a cabinet of a game she liked (+0.3 and three plays), in front of her, that
is a `game_lost` event, and **a wound for the spider Calling**. If it happened while she was away (the hall's catch-up), she
finds the empty space the next time she is there (`Mind.mourn`).

**Every game has a creator** (`creators.ts`). A Muse designer for a licensed game, a cracker for a bootleg, rolled from the
world seed and the title, so the same person every time. **They exist nowhere until she finds out who they are**: the first
time she learns, the person is made and settled in a flat, shop, bar, club or arcade out in Neo (weighted toward the dangerous
and the unvisited), and she is told where when the route gives her an address. Five ways to learn, from five kinds of row:

| Route | Where | Gives |
|---|---|---|
| `record`: number one on the game's board, the credits roll | any cabinet (`playOne`) | the name and the address |
| `override`: an Override on the machine (Power Cut is the key that fits; more known, better odds) | `override-cabinet` (hall) | the name and the address |
| `pros`: ask the champions, streamers and hustlers | `ask-the-pros` (hall; costs a round) | the name only |
| `intel`: dig through credits, forums and patch notes | `dig-credits` (hall) | the name, or the address if she has the name |
| `records`: take a copy out of a records office (a property office, or a records floor in a tower) | `records:steal` (`records.ts`) | the name and the address |

A bad try at an Override marks her; a bad try at a registry bars her from that office.

**The Callings** (`content/callings.ts`, group `play`):

| Calling | Line | Born of | Counts | Bias / pull |
|---|---|---|---|---|
| **Number one** (`board`) | "get number one on a leaderboard that matters" / "have her name at the top of N leaderboards at once" | a record, a bracket won | boards she tops *right now* (a spider's wreck takes one away) | play, brackets, ladders; pulled to arcades she knows |
| **Gaming money** (`gamecash`) | "make Nnd from nothing but playing games" (300 to 30,000) | a payout | `earned` on events, anywhere | play, bets, brackets, pawn and hub rows |
| **Spiders** (`spiders`, a wound) | "put N Muse compliance spiders in the ground" | a loved game destroyed; killing or watching one | `spiders_killed` | fight the spider; against calming it; pulled to arcades, harder to one with a visit under way |
| **The creator** (`creator`) | "find out who made "X", and flatline them", then "flatline Y, who made "X"" | hating a game | the creator dead | phase one: the intel rows and `records:steal`, and playing that very game; phase two: a hunt, as vengeance is |

The creator Calling re-aims itself as she learns (`sync`): from a title, to a person, to a person at an address. The kill goal
it makes is an ordinary goal, so the usual machinery applies: she preps, shops for a weapon, gets hurt, resumes.

**What was not done:** no hero state beyond `Mind.games`; no fight changes; the creators have no bodyguards and no faction;
nothing clamps any of it.
