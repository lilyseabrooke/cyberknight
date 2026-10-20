# Location spec: The Arcade (game hall)

**Status:** DRAFT. Everything is **PROPOSED** unless it is in "Decided". Numbers are starting points; they are not tuned
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
