# Location spec: Hacker Hub (the Patch Bay)

**Status:** IMPLEMENTED (see "What was built" at the end for where the build differs). Everything is **PROPOSED** unless it is in "Decided". Numbers are
starting points; they are not tuned (see CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept (author):** a hacker's hub where she can purchase new Hack and Override techniques.
- **Shape:** a **lot**. The twelve `LEARNABLE` techniques (`techniques.ts`) have, until now, no source ("nothing hands them out yet"). This is it.
- **Slimmer skill list (author):** this place is focused. The rows draw on a **short list** of capabilities: tinkering (hacking) and INT, the
  stealth trio (sneak, lockpicking, sleight), the grifters' (grifting, haggling, streetwise, charm), a little intimidation and melee, and a handful of
  drives. It does not try to give a use to every skill in the game. The coverage tool will show a lot of `-`; that is intended.
- **A corporation that is not Atlas (author):** **Titanware**. Atlas is the defence industry; Titanware is cyberware and hacking tech, and it is the
  surveillance corporation: a creepy open **eye** for a logo, and every piece of its chrome reports what the body around it is doing. Its **Training
  Academies** hand out glossy brochures that say **"Think the Right Way"**; they are thinly-veiled brainwashing, and they also teach techniques.
  Titanware goes into `world.md` / `factions.md` / `naming.md` as a new kind of thing (not just an instance).

## 1. How the three principles shape this spec

| Principle | In practice |
|---|---|
| Maximalism | Rolled from variant (8) x shell (12) x size (5) x condition (5) x tier (5) x traits (0-3 of 30) x situation (16) x wild card (8), plus a **syllabus**: 1-6 of the twelve techniques, each with its own teaching route (7) and price. Two hubs rarely teach the same thing the same way. |
| Unbalanced | Wild cards are in on purpose: a Master who teaches anything for a price nobody should pay, a cursed course that teaches too well. A free route (steal it, a referral) beats a paid one. Nothing is clamped. |
| Multidimensional | Rows for a *short list* of capabilities (see 0), written as soft requirements. The syllabus itself is open: `LEARNABLE` is a list; a new technique is one new row in `TECHS`. |

## 2. Concept

Every hacker in Neo has the same problem. The good exploits live in other people's heads, and nobody gives them away. The hub is where they get sold:
a data café with one good chair, a basement exchange where the price of a tutorial is a favour, a "continuing education centre" that is a ring of
ICE-jockeys running a seminar for a hundred and ten nd a head. Each has a **syllabus** on a chalkboard, and every line of it says who teaches it, what it
costs and what the catch is. To tinkerers it is the point of the place. To thieves, a teacher's rig is a thing to copy. To grifters, a certificate is a
thing to print.

**Atlas is wallpaper** (a safe-T poster, a drone that "isn't recording"). **Titanware is the thing on the wall that watches back.** A small open eye in
the window ("Titanware Verified"), a vitals scanner on the door that logs your pulse, a brochure rack. The Titanware Training Academy is the one variant
where it runs the place, and there the lessons are real, free, and come with a module on how to think.

## 3. Placement

- **Role / kind:** `GenRole 'hub'`, `Location.kind 'hub'`, `Location.hub` (`HubInfo`). A single floor; no child rooms (see 14).
- **Own random streams:** `hubchance:${worldSeed}:${streetId}` (does the street have one) and `hub:${worldSeed}:${id}` (what it is), the slot added after
  the chop shop's (and the realty office's), so **no existing map changes** and `LOTS` is untouched.
- **Chance a street has one** (`HUB_CHANCE`): nightlife 0.08 · market 0.05 · industrial 0.06 · corporate 0.07 · tenement 0.04 · slum 0.03 (about 1 street in 16).
  It is the only teacher, so it is rarer than a gym.
- **Variant weights by district** (`HUB_VARIANT`): corporate leans academy and mill; nightlife café, arcade and den; industrial garage and exchange; slum
  exchange, lockers and den; market café and mill; tenement den, lockers, arcade.
- **Faction:** venue faction `v:<id>`; killing the owner shuts it (`shutdown.ts`). Hours: 10:00 to 04:00 (the academy 08:00 to 20:00).

## 4. A hub is a point in a space

Everything below is rolled once, from the hub's own stream, and stored on `Location.hub`.

### 4.1 Variant

| Variant | Is | Pass (terminal hour) | Leans toward |
|---|---|---|---|
| **cafe** | a data café: one good chair, a kettle, a rack in the back | 9nd | cash, lessons |
| **exchange** | a warez exchange: no names, pay in parts or favours | 0 (barter) | barter, steal |
| **mill** | a seminar mill: certificates, terms, a payment plan | 14nd | cash, trial |
| **den** | a crew den: invite only, loyalty counts | 0 (members) | referral, lessons |
| **arcade** | an arcade backroom: win the course | 6nd | trial, steal |
| **academy** | **Titanware Training Academy**: free, glossy, "Think the Right Way" | 0 (enrolled) | enrol |
| **lockers** | a dead-drop locker wall: nobody is ever there, the knowledge is in the locker | 5nd | steal, barter |
| **garage** | a teardown garage: hardware first, theory later | 8nd | lessons, barter |

Names are `{adj} {noun}`, `{owner}'s {thing}` and one-liners per variant (10+ each); grep each before commit. Seeds: *Dial-Up & Dumplings · Null Route
Noodles · Pemberton's Evening Classes · Root Cellar Collective · Cold Boot Arcade · Titanware Training Academy (Branch 214) · Locker Nine-Nine · The
Third Hand Garage.*

### 4.2 Shell

A converted internet café · a bus depot office · a server closet behind a noodle bar · a laundromat with a rack in the dryers · a flooded data-centre
annex · a tram-car office · a church organ loft · a cable junction under a flyover · a shuttered video-rental store · a row of self-storage units · a
rooftop water-tank hut · a car-park deck. Shells set blurbs, security and a few features.

### 4.3 Size, condition, tier

- **Size:** closet · small · medium · large · sprawl (how many features and how big the syllabus can be: 1-2, 2-3, 3-4, 4-5, 5-6).
- **Condition:** derelict .. immaculate (shared with the gym).
- **Tier 1-5:** teacher quality and prices. Independent of everything else: a gleaming tier-1 and a derelict tier-5 are both valid.

### 4.4 Traits (0-3 of about 30)

*ownership/tone:* house AI that grades everyone · no-names rule · pays in favours · a ghost in the router · newbie tax · a rival hub across the road ·
Titanware Verified (an eye sticker, a vitals scanner at the door) · Titanware leases the rack and reads the logs · crew recruiting · membership tiers ·
blackout wing · rig cat · soundproofed · free tea · cash only · bring your own cable · live stream · locked forum · a retired ICE-breaker owns it · hall
of fame wall · hot hardware · taxed by a gang · bug-bounty board · a dead man's terminal · rain leaks on the rack · a parrot that knows a password · all
labels in capitals · sponsored by an energy drink · silence rule. They contradict freely.

### 4.5 Situation (a pure function of the clock, 0-1 at a time)

CTF night · zero-day auction · raid rumour · sysop feud · free lesson day · main rig bricked · wipe night · Titanware wellness audit · open day · power cut
· newbie surge · teacher away · rival poaching · heist being planned · pizza night · a bounty posted on the board. Situations switch rows on and off and
sometimes change the price of the syllabus.

### 4.6 Wild cards (about 1 in 12)

- **The Master:** teaches anything on the syllabus, one lesson, for an enormous fee.
- **The cursed course:** every lesson takes; every failure is worse.
- **The honeypot:** everything is free, and everything is logged (a Titanware sting).
- **The ghost instructor:** a dead hacker's last lesson, on a loop.
- **All-you-can-learn:** a subscription; she never quite leaves.
- **Every terminal is trapped.**
- **Three for one:** the syllabus is longer than the room.
- **Branch Zero:** Titanware's flagship; the eye is on everything, and the teaching is excellent.

## 5. Features (objects the rows hang off; ~34)

terminal row · server rack · patch panel · CRT wall · scoreboard · CTF board · notice board · forum terminal · membership desk · tip jar · vending machine ·
noodle counter · solder bench · junk bin · cable drum · locker wall · safe · camera console · router cage · house-AI kiosk · arcade cabinet · pinball
table · stage · hall of fame · mural wall · cat bed · pigeon roost · skylight · vent · side door · fire cabinet · whiteboard · brochure rack · vitals
scanner. 2-12 per hub, by size and variant.

## 6. People

- **Owner / sysop** (90%): kill and the place shuts. **Teacher** (the one who has the syllabus), **front desk**, **regulars** (ephemeral), a **guard**
  (more where security is high), a **house-AI bot** (with the trait), a **ganger** collector (rare), and at the academy a **counsellor** and a
  **Titanware compliance liaison** (small badge, large smile).
- Names from the person generator; pronoun tokens in prose.

## 7. Affordances: what each capability sees

Row schema as in `affordances.ts` (`id`, `where`, `needs`, `sees`, `stakes`, `consequence`, `drives`). About 50 rows in `content/hub*.ts` (78 as built). The syllabus
itself is not a table of rows: it is a list on the hub (`HubInfo.syllabus`), turned into candidates in `hub.ts` (like the chop shop's ways in).

| Capability | Sees | Does |
|---|---|---|
| **tinkering, INT** | the terminal rows, the rack, the bench | Rent a terminal; run a sandbox; fix a rig for pay; enter the CTF; unbrick the main rig |
| **sneak** | the vent, the skylight, the side door | Sit at the back of a lesson; slip in without a pass; trail the teacher |
| **lockpicking** | the locker wall, the safe, the server closet | Open a locker; crack the safe; open the closet |
| **sleight** | the tip jar, the benches | Lift a wallet; skim the jar; copy a teacher's rig |
| **grifting, haggling** | the membership desk, the certificate | Print a certificate; haggle the hourly rate; phish a newbie |
| **streetwise** | the notice board, the forum | Read the board; fence stolen hardware; run a dead drop |
| **charm** | the desk, the regulars | Get a referral; charm the sysop |
| **intimidation, melee** | the sysop, the rack | Lean on the sysop; smash a rival's rig |
| **drives:** curiosity, greed, pride, bravery, quest | the locked syllabus; the till; the hall of fame; the bounty board | Find out; rob it; get on the wall; take the heist |

Wild cards, variant and situation rows are in `hubevents.ts`. Last row: *(your next capability goes here)*.

## 8. Systems

### 8.1 The syllabus and the routes

`HubInfo.syllabus`: a list of `{ tech, route, price }`. `tech` is a `LearnableId`. A technique she already knows is not offered again. Teaching
**routes** (each a way to turn the entry into `learnTechnique`):

| Route | What it takes |
|---|---|
| **cash** | pay `price` |
| **lessons** | two to four sessions of chores for the teacher, no fee (counter `hublesson:<id>:<tech>`) |
| **barter** | hand over components worth `price / 10` (parts, `hero.parts`) |
| **trial** | pay a quarter, sit a live test against tinkering and INT; a miss costs the fee and a shock |
| **steal** | copy it off the teacher's rig (sleight, sneak, tinkering); a miss is heat and a grudge |
| **referral** | free, but the teacher must already like her (affinity 10+) |
| **enrol** | the Academy: free, and two or three **Right Thinking** modules come with it |

The price is `base x tier x variant x traits x situation`; the Master and the Branch Zero ignore the usual caps. **Limits come from the world:** money,
the teacher's regard, parts, heat, and whether the hub is still open.

### 8.2 Right Thinking (the Titanware conditioning)

Each Right Thinking module (at an Academy, and a few places with a Titanware sticker) adds one to `counters.think` and nudges her personality a little
toward **agreeable, incurious and tidy** (`mischief`, `impulsive`, `grudge` down; `sociable`, `loyalty` up; steps of 0.02-0.03, at most 8 steps).
It is a lasting consequence, and it is the price of the free lesson. She notices nothing; the field report does, in a very small voice. A **deprogramming**
row (crew dens, exchanges) takes the steps back out. Her enemy never changes: it does not touch her hatred of Atlas (hard rule 1).
Alumni (`think >= 3`) get a discount at any Academy ("Titanware remembers you"). Nothing is clamped.

## 9. Setting texture and hard rules

- **Texture:** a fee on everything (hourly rate, tier, "terms apply") · invented brands (Titanware; Panopt, VitalSigns+, Lidless) · Atlas as wallpaper,
  Titanware as the eye · specific numbers (110nd a seat, branch 214).
- **Hard rules:** (1) Blackbird opposes Atlas; the Academy is Titanware's, and it never turns her toward Atlas. (2) Nothing grim: the brainwashing is
  absurd brochures and a quiz, not torture; a bad module is a headache and a mug. (3) Punch up: the jokes are on the corporation, the brochure and
  the sysop's ego; the students and regulars are never the butt. (4) Invented brands only. (5) The teachers and the counsellors are competent people with
  their own goals, and can refuse her. (6) Adult, not explicit.

## 10. Engine touchpoints

| File | Change |
|---|---|
| `types.ts` | `GenRole` + `Location.kind` gain `hub`; `HubInfo` and `Location.hub` |
| `content/hubs.ts` (new) | variants, shells, traits, features, situations, wild cards, techniques table, syllabus roll, roster |
| `content/hubafford.ts`, `hubcrime.ts`, `hubevents.ts` (new) | the registry rows |
| `hubkit.ts`, `hub.ts` (new) | view, `runCheck`, teaching, conditioning; candidates and `describeHub` |
| `mapgen.ts`, `roster.ts`, `content/archetypes.ts`, `grid.ts`, `hexmap.ts`, `layouts.ts`, `shapes.ts`, `hours.ts` | placement, people, geometry |
| `interactions.ts`, `clock.ts`, `run.ts`, `stage.ts`, `shutdown.ts`, `text.ts`, `index.ts` | candidates, durations, aggression, prestige, owner dead, prose |
| `scripts/hubs.ts`, `scripts/coverage.ts`, `package.json` | `npm run hubs`, coverage |
| `components/NightViewer.tsx` | labels, if the kind is listed |

## 11. Tests

`hub.test.ts`, after `pawn.test.ts`: determinism; tables name things that exist; a wide space; district shaping; existing maps unchanged; people cast;
every row's `where` names real things; a forced run of every row (three kinds of luck, no stray tokens, each row tells something); every technique can be
learned by every route; the syllabus never offers a known technique; the owner dead shuts it; Right Thinking counts, nudges and reverses.

## 12. Coverage

`npm run coverage` will show the hub row heavy on tinkering, int and the stealth and social skills, and empty for music, dancing, fishing and so on.
That is the slimmer list, on purpose.

## 13. Open items

1. **Titanware heat:** nothing in the engine reads a `titanware` heat yet; the eye is flavour plus Right Thinking. (Proposed default: leave it.)
2. **Techniques that are not yet learnable** (more Hacks and Overrides): add an id to `TECHS` and it can turn up.
3. **Titanware elsewhere** (a Titanware clinic, a corp tower, chrome that reports on you): the world now has room for it.

## 14. What was built

Code: `content/hubs.ts` (what a hub is, the techniques table `TECHS`, routes, prices, `rollHub`, the people), `content/hubafford.ts` /
`hubcrime.ts` / `hubevents.ts` (the rows), `hubkit.ts` (the view, `runCheck`, the seven teaching routes, Right Thinking), `hub.ts`
(candidates, the syllabus family, `hubUrge`, `describeHub`), plus hooks in `mapgen.ts`, `roster.ts`, `content/archetypes.ts`, `grid.ts`,
`hexmap.ts`, `layouts.ts`, `hours.ts`, `stage.ts`, `shutdown.ts`, `clock.ts`, `run.ts`, `interactions.ts` and `text.ts`. Tooling: `npm run hubs`,
`npm run coverage`. Tests: `hub.test.ts`.

Differences from the draft:

- **No child rooms.** A hub is one floor with features, like the chop shop. (The spec's section 3 already said so; the protocol's room graph
  is for the big places.)
- **The syllabus is the main thing, not rows:** `HubInfo.syllabus` is turned into `hubdeal:learn:<tech>:<route>` candidates (a family of its
  own, so a long menu cannot crowd it out), and `hubUrge` pulls her toward a hub with a line on the board she could take, and back to one
  where a lesson is half done. 78 registry rows around it (the spec said about 50).
- **Skills:** 14 of them named across the rows (plus the four stats and six drives), by design (the author asked for a slimmer list). `npm run coverage` therefore shows `-` for music,
  dancing, fishing, cooking and the rest. Tinkering has 42 rows, INT 32.
- **Routes:** the seven in 8.1. The "duel the teacher" idea became the `trial`.
- **Right Thinking** is a counter on the world (`counters.think`, at most 8) and a small, reversible nudge to five personality traits
  (`THINK_STEP` in `hubkit.ts`); the weights are recomputed. `deprogram` takes steps back out. Not built: Titanware heat (OPEN, as in 13).
- **Not built:** a hustle (a shift at the desk); a per-beat tick (there is no shelf or stock to turn over); a "kill goal" row (killing the
  sysop works through the ordinary fight and shuts the hub).
- **Wild cards built:** all eight (the Master, the cursed course, the honeypot, the ghost instructor, all-you-can-learn, every terminal trapped,
  three for one, Branch Zero).

Numbers to watch (all deliberately unbalanced): technique prices (`TECHS`, `rollPrice`), the Master's x4, the trial base 0.30, steal base
0.22 (it loses a lot in real runs), the alumna discount, `THINK_STEP`.

Real runs (400 autonomous runs, three competence levels): a hub was in reach in about 1 run in 3 and she walked into one in 26 of them
(6.5%, the same as the pawn shop and the gym), took part in the syllabus in about half of those and came out with a technique in 6
(1.5%); the first Academy module showed up in 1. Lessons mostly stay half done after one visit; `hubUrge` now adds a pull back for them.

Verification: `npm run typecheck` and `npm test` green. `npm run test:full` was **not** run, per CLAUDE.md (balance is out of scope and
the change touches no core simulation logic).
