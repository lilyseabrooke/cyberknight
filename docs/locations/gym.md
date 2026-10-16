# Location spec: Gym / Dojo

**Status:** DRAFT v3, rewritten around the three design principles (maximal, unbalanced, multidimensional). Everything is
**PROPOSED** except the "Decided" box. This file is also the worked example of the location spec schema.

## 0. Decided

- **Concept:** a gym / dojo, a place to train, spar and fight for rank, and (under multidimensionality) a lot more than that.
- **Shape:** a **lot** (a full place on a street).
- **Soreness:** a new hero state (§8.0). **Techniques:** not in v1. **Frequency:** about one per ten streets.
- **Pit paper:** most pit fighters have bounties; she can collect one only by killing the fighter, which goes over badly
  (§8.3). **Pit bets:** fight only in v1 (open item).
- **Principles** (apply to every location, not only this one):
  1. **Maximalism.** More options, more permutations, more features. No instance has everything; the *space* is huge.
  2. **Unbalanced.** No tuning for fairness. Outliers are features. The only limits are the ones the world supplies
     (money, finite stock, heat, grudges, bodies) and the ones that keep saves stable (determinism, own random streams).
  3. **Multidimensionality.** Every location offers something to *every kind of capability*, and the list of
     capabilities is open and growing. Nothing in a location says "fighter" or "rogue"; it says what you can do here if
     you are good at X.

## 1. How the principles shape this spec

| Principle | In practice |
|---|---|
| Maximalism | A gym is **rolled from independent axes** (variant × shell × size × condition × traits × situation), not picked from three boxes. Rooms and features are drawn from a big pool by chance. Roughly 10 variants, 12 shells, 40 traits, 20 situations, 40 features, 14 room kinds. Two gyms rarely match. |
| Unbalanced | No numbers below are tuned. Wild cards (§7.3) are in on purpose: a cursed rig, a legendary coach, an absurd tournament. Nothing is clamped for fairness. |
| Multidimensional | The heart of the spec is §7: **affordances**, each with a *soft* requirement (anything can try it; skills move the odds). A **coverage tool** (§12) reads the live skill / stat / drive list and flags capabilities this location doesn't serve, so it stays complete as new capabilities are added elsewhere. |

## 2. Concept

Neo sells everything as a subscription, including getting hit. The gym is where being hit is the product, and also where
a body becomes a résumé: for a fighter it is a ring, for a thief it's a hundred unlocked lockers, for a cook it's the
juice bar, for a flirt it's a mirror-wall and an audience, for a hacker it's the membership terminal. The same room reads
differently to everyone who walks in. Atlas appears as wallpaper (a wellness poster, a camera, an injury plan), never as
the operator, unless the gym is the Atlas-franchise variant, where it very much is.

## 3. Placement

- **Role / kind:** `GenRole 'gym'`, `Location.kind 'gym'`. Rooms are roles from §5; all use kind `gym` and get rosters by role.
- **Own random stream** `gym:${worldSeed}:${streetId}`, after clinics and spots, like they are, so **no existing map
  changes** and `LOTS` is untouched.
- **Chance a street has one** (`GYM_CHANCE`): market 0.05 · nightlife 0.08 · tenement 0.12 · industrial 0.10 ·
  corporate 0.06 · slum 0.08 (about 1 in 10 streets).
- **Variant weights by district** (`GYM_VARIANT`; 0 = never, absent = 1):

  | District | boxing | dojo | chrome | atlas fit | climb | range | cage | studio | wellness | youth |
  |---|---|---|---|---|---|---|---|---|---|---|
  | market | 2 | 2 | 1 | 1 | 1 | 0.5 | 1 | 2 | 2 | 1 |
  | nightlife | 1 | 1 | 3 | 1 | 1 | 1 | 2 | 4 | 1 | 0.2 |
  | tenement | 4 | 2 | 1 | 1 | 1 | 0.5 | 2 | 1 | 1 | 3 |
  | industrial | 3 | 0.5 | 3 | 0.5 | 2 | 2 | 3 | 0.3 | 0.2 | 1 |
  | corporate | 0.5 | 3 | 3 | 4 | 1 | 1 | 0.5 | 2 | 4 | 0.1 |
  | slum | 4 | 1 | 0.5 | 0.1 | 2 | 1 | 3 | 0.5 | 0.5 | 3 |

## 4. A gym is a point in a space

Everything below is rolled once, from the gym's own stream, and stored on `gen`. Axes are independent, so any combination
can occur, including incoherent ones (that's often the best ones).

### 4.1 Variant (the main thing it is)
Each variant: names, blurbs, the skills it trains, a day pass, a vibe, an Atlas relationship.

| Variant | Trains | Day pass | Vibe / joke |
|---|---|---|---|
| **boxing** | melee, athletics | 15nd | grubby, warm, underfunded; "again" |
| **dojo** | melee, sneak | 40nd | pompous etiquette invented last spring; belt colours |
| **chrome** (augment bay) | athletics, melee | 55nd | hydraulic spotters, vanity, upgrades by instalment |
| **atlas fit** ("Safe-T Fit") | athletics | 0nd, then subscription tiers | cheerful, camera-ridden, wellness metrics, upsells; the one that punches up hardest |
| **climb / parkour hall** | athletics, sneak | 25nd | roofs-in-a-box; the walls have route names that are threats |
| **range** (shooting) | marksmanship, throwing | 30nd + ammo | lanes, a safety lecture longer than the session |
| **cage** (MMA / wrestling) | melee, intimidation | 20nd | blood is a lighting choice; the bell is a vending machine |
| **studio** (dance / pole / aerobics) | dancing, romance, athletics | 20nd | mirrors, playlists, the instructor has fans |
| **wellness** (yoga / float / meditation) | medicine, tolerance, rapport | 60nd | a cult with a cancellation policy; very calm |
| **youth club** | athletics, streetwise | free | street kids, a donated ring, a coach who's tired and good |

Names are assembled from tables (`{adj} {noun}`, `{owner}'s {thing}`, `{thing} {suffix}`) per variant, with 10-20 entries
per slot, so names rarely repeat. Seeds: *Glass Jaw Gym · The Last Round · Southpaw Social Club · The Humble Crane (est.
last spring) · Way of the Open Palm (Annual Tier) · Hydraulic Hank's Lift & Lube · Torque & Tonic · Safe-T Fit (Branch
4,117) · Chalk & Consequences · Lane Nine · Teeth & Mat · Spin Cycle Studio · Still Water (Terms Apply) · The Open Door
Boys' Club.* Grep each before commit.

### 4.2 Shell (what building it's in)
Converted church · shipping container stack · tram depot · multistory car park · flooded basement · rooftop under tarps ·
shuttered cinema · old swimming baths (the pool is a sparring pit) · decommissioned Atlas depot · a market's upper floor ·
a bank vault · a warehouse with half a roof. A shell sets blurbs, security, hazards (the baths are slippery, the car park is
echoey and visible from everywhere) and which rooms/features fit.

### 4.3 Size, condition, tier
- **Size:** closet (1 floor room) · small · medium · large · sprawl (several floors). Sets how many feature slots roll
  (2-3 / 4-5 / 6-8 / 9-12 / 14+) and how many rooms may exist.
- **Condition:** derelict · scruffy · decent · gleaming · immaculate. Sets graffiti, security of equipment, how
  broken things are (a derelict gym has a ring with a hole in it you can hide in).
- **Tier 1-5:** trainer quality, pit-fighter levels, prices. **Tier is independent of everything else**: a gleaming
  tier-1 and a derelict tier-5 are both valid and both interesting.

### 4.4 Traits (0-3 per gym, drawn from a pool of ~40)
Each trait changes blurb, prices, features, people or situation. Pool, open and meant to grow:

- *ownership:* owned by a retired champ · by a gang's front · by Atlas · by a franchise manager who's never lifted ·
  by a trust of regulars · abandoned and squatted · by a wellness influencer
- *tone:* celebrity-trainer's gym · obsessively hygienic · filthy and loved · silent (no talking, ever) · always
  loud · sponsored by a beverage · themed (all rooms pun on a single idea)
- *access:* members only (needs a pass, a forged one, or a way in) · pay what you can · no phones, locked in boxes ·
  open all night · women/men/no-one-over-30 only · invite-only after hours · "guest of a member" system
- *scene:* a famous gym where a famous fighter came from (hall of fame wall) · on the way out, being sold · feud with the
  gym across the street · an Atlas inspection regular · a gang's training camp · a cult
- *kit:* has a live-stream rig · hydraulics · a sauna · a pool · a rooftop · a rooftop pigeon coop · a robot spotter ·
  a real ring · a boxing robot · a vending machine that sells protein of dubious provenance
- *quirks:* the trainer is a robot · the owner has a pet · the gym cat · everything is labelled in a dead language ·
  all prices are in a cursed currency (tokens, minted nowhere) · a tab system (pay after)

Traits can contradict. The generator doesn't care; the blurb writer makes the contradiction a joke.

### 4.5 Situation (a thing happening right now; 0-1, rerolled over time)
Tournament this week · open day, free passes · owner in debt, gang collecting · Atlas inspector visiting · trainer
missing (grudge / abducted / on holiday) · a celebrity's filming · a break-in last night, lockers open · a mass
brawl just ended, the place is a wreck · a rival gym's challenge posted · a recruitment drive (the staff are watching
who is good) · power cut (the rigs are off, the sparring is in the dark) · a heist being planned in the sauna · a wedding
reception in the hall · a lost dog · a funeral for a regular · the boiler's out and the pool froze.
A situation turns affordances on and off and gives the gym a reason to be interesting *now*.

## 5. Rooms and features

### 5.1 Rooms (child places, drawn by chance, depending on size/shell/variant; each can be hidden / guarded / locked)
Locker room · owner's office · fight pit · sauna / steam / coolant bath · juice bar · pro shop · physio room · stream
studio · class hall (kids, dance, meditation) · roof · basement · storeroom · vent crawlspace · back alley with a bin
fire. All of them are optional; each has its own chance table by variant and size. A sprawl can have eight; a closet
none.

### 5.2 Features (objects in rooms that candidates hang off; ~40 in the pool, 2-14 per gym)
Heavy bags · ring · mats · rigs · treadmill wall · climbing wall · shooting lane · pull-up bar rack · mirror wall · hall of
fame photo wall · notice board · membership terminal · CCTV console · owner's safe · lockers · lost-and-found · tool bench
(equipment repair) · juice bar tap · supplement counter · pro shop rack · physio table · music system / DJ booth · stream
rig · vending machine · robot spotter · gym cat · trophy case · scoreboard · betting book · water cooler (gossip) · bulletin
for gigs · donation tin · "break glass" fire cabinet · cleaning cart · vent grille · skylight · side door · trampoline ·
heavy door to the pit.

## 6. People

Cast by role per room and per variant (rosters get an optional `variants` and `traits` filter on a slot). Pool is open.

- **Owner:** retired champ · franchise manager · gang front man · burnt-out sensei · ex-con · influencer · robot. Killing
  an owner shuts the gym (like the Halo).
- **Staff:** trainer / coach / sensei / rig-tech / instructor · front desk · cleaner · juice-bar person · physio · pit boss ·
  security. Each has a level (tier) and a quirk.
- **Regulars:** the rotating crowd (ephemeral), and a few *named-by-role* sparring regulars who remember her.
- **Pit fighters:** one per ladder rung; 70% carry a bounty.
- **Visitors that situations bring:** a gang collector, an Atlas inspector, a celebrity and entourage, a scout, a rival gym's
  champ, the police looking for someone, a kid hiding from something.
- **A rival enforcer** (existing `ganger` slot with `faction: 'influence'`).

Names via the person generator. Pronouns by token.

## 7. Affordances: what each capability sees

The principle: **requirements are soft; capabilities are open.** The code never asks "is she a fighter?". An affordance
is a candidate (`Candidate` in `candidate.ts`) attached to a feature or a room, with `drives` (what makes it appeal),
`needs` (capabilities it draws on), and an `odds` formula that uses the *same synergy machinery* as the rest of the
game (`odds`, `synergy`, `skillLevel`). Skill moves the odds; anyone can attempt, and a clumsy attempt is still
interesting. The set is open: new skills, stats, drives, items and implants appear in `needs`; other protocols append
affordances.

### 7.1 The schema (what a spec row must say)

```
affordance:
  id            kebab-case, unique
  where         feature(s) / room(s) / situation that enables it, plus any trait/variant filter
  needs         capabilities it draws on (skill:x, stat:x, drive:x, item:x, implant:x, tag:x, goal:x)
  sees          one line, what that capability notices here (the "lens"; it feeds blurb/knowledge text)
  does          what it actually does (the candidate)
  stakes        what it can win and what it can cost, in world terms (cash, fame, heat, grudges, injuries, access)
  consequence   what the world remembers (a flag, heat, wary, bond, fact, shut)
```

### 7.2 Seeded affordances (starting set, deliberately broad; not a list of "classes")

| Capability (open set) | Sees | Does |
|---|---|---|
| **melee, athletics, muscle** | the ring, bags, rigs | Pay-to-train; spar a regular; ladder bout; hold the rope for an old champ |
| **marksmanship, throwing** | the range lane; darts on the notice board | Range session; side-bet shooting; dart the rival's poster |
| **sneak** | the skylight, vent, side door | Slip in without paying; drop onto the roof; trail the owner to the office |
| **lockpicking** | 80 lockers, the owner's safe | Burgle the lockers; crack the safe (the shake-down money from the till); open the pit door |
| **sleight** | bags left on benches; lost-and-found | Lift a wallet; swap a protein tin; shave a purse |
| **tinkering** | the broken rig, the tool bench | Fix equipment for pay; sabotage a rival's rig; build a gadget from the junk bin |
| **cooking, mixology** | the juice bar and supplements counter | Work the bar; invent a "recovery shake" that works or doesn't; sell a stim-smoothie |
| **medicine** | the physio table | Treat a regular for cash; ease her own soreness; learn from the physio |
| **scavenging** | the bins, the bone-yard of old kit | Pick the scrap heap; find the thing the last owner hid |
| **hack** | the membership terminal, CCTV console, scoreboard, robot spotter | Free membership; erase footage; rig the scoreboard or the betting book; hijack the robot spotter |
| **charm, romance, dancing** | the mirror wall, the studio, the sauna | Flirt with a regular; lead a class; a sauna date; a dance-off |
| **vocals, music, djing, guitar, beatbox** | the class sound system, the DJ booth | Run a class's playlist for tips; a lunchtime gig; a beat battle on the mats |
| **intimidation** | the weak, the debtors, the owner | Shake down a regular; lean on the owner; stare down a rival |
| **streetwise, haggling, grifting, cards** | the notice board, the betting book, the pro shop | Learn who owes whom; hustle a day pass; con a mark into a spar; play cards in the locker room |
| **art** | the blank wall, the hall-of-fame wall | Tag it; paint a mural for the owner; vandalise a rival's photo |
| **rapport** | the gym cat, the robot spotter, the pigeon coop | Befriend them; the cat leads her to a stash; the spotter is on her side |
| **fame / pride (drive)** | the stream rig, the hall of fame, the scoreboard | Film a stunt; get on the wall; be seen with a champ |
| **greed (drive)** | the till, the safe, the betting book, the belt | Rob it, work it, bet on it |
| **curiosity (drive)** | the locked pit door, the missing trainer | Find out why |
| **quest (drive)** | the situations | Take the tournament; solve the missing trainer; fix the feud |
| **tolerance** | the supplement counter | Test a dubious supplement |
| **implants (tag)** | the chrome gym's tune-up and the rigs | Tune-up; a glitch fix; a rig fit; a "catch" removed |
| **kill goal (goal)** | a ladder fighter, the owner | Kill in the pit (costly, §8.3); murder the owner (shuts the gym) |
| **items** | a championship belt, a stolen guitar, a forged pass | Use them as keys, bribes, gifts or bets |
| *(your next capability goes here)* | | |

Every row is a *candidate generator*, not a code path per class. A gym rolls features; features enable rows; a given
Blackbird sees whichever rows her capabilities and drives make appealing.

### 7.3 Wild cards (unbalanced on purpose)
A fraction of gyms (roughly 1 in 12) roll one of these. No clamping; they're meant to break things.
- **The legendary coach:** teaches in a single session what takes weeks elsewhere, for an enormous fee.
- **The cursed rig:** hugely powerful training, with a catch that will absolutely ruin a night.
- **The Atlas open-ended promotion:** the first 50 members get lifetime membership and a free implant "reminder".
- **The rigged tournament:** every bout is fixed, and one fighter knows.
- **The pit that never closes:** an all-night battle royale for a purse that grows each night nobody wins.
- **A dojo with a ghost.**
- **The gym where every feature is a trap.**
- **A secret society** that recruits the best sparrer and doesn't take no.

## 8. Systems (the heavier mechanics)

### 8.0 Soreness (new hero state)
`Hero.sore` 0..1. Training adds `0.18` a session, sparring `0.08`, ladder `0.12`. It recovers `-0.004` a beat, faster
resting at home, `-0.04` in a sauna or on a physio table. Fight power scales by `1 - 0.25 × sore`; `maybeInjure` chance
scales by `1 + sore`. Above `0.6` the appeal of training drops. Old saves load as 0. Not balanced; just a consequence.

### 8.1 Training
Day pass (variant price × tier modifier), paid into the till. XP `2.0 × trainerQuality`, where trainerQuality is
`0.7 + 0.1 × trainer level`. Venue fatigue (`stage.ts`) reduces repeat XP per skill per gym until it recovers.

### 8.2 Sparring
A normal non-lethal `fight`; XP half of a full session; affinity changes; chance of a friend or a grudge (`bondEvent`).

### 8.3 Ladder and the pit
- `loc.ladder = { rank, wins }`. Rungs by variant: 3 (dojo belt trials) to 6 (cage).
- Entry fee 20nd; purse `30nd × rung`; fame via `fameFrom`. Top rung needs a pit.
- **Killing in the pit.** The fighters carry the `nonlethal` tag by the house rule. She can kill one only with a `kill`
  goal aimed at exactly that fighter (the `marked` rule in `combat.ts`). Then she collects the bounty (70% have paper) and the
  pit turns on her: the pit boss and crowd go hostile, heat jumps, she's barred (shut to her; shut for good if the
  owner is the victim), the ladder is wiped, the owner's affinity drops through the floor.

### 8.4 Shifts
A hustle (`hustles.ts`): front desk, towel duty, sparring dummy, juice bar, stream camera. Open shifts accrue while the
gym is busy and cap at 2. A wary room refuses her.

### 8.5 Money, information, access
The till, the book and the safe hold finite cash (rises with traffic, like shop till in `tickHustles`). Rumours come
from the locker room, the sauna and the notice board (`knowledge`/`facts`). Access (members only, invite-only, no phones)
is a gate with several keys: pay, forge, hack, sneak, charm, fight your way in.

## 9. Setting texture and hard rules

- **Texture:** fee ✓ · brand ✓ · Atlas presence ✓ · specific number ✓ (see §4.1).
- **Hard rules:** (1) Blackbird opposes Atlas, and the Atlas franchise variant is her natural enemy, not a place she
  could ever join. (2) The pit is a show; defeat is a knockdown; death is a rebuild. (3) Punch up: the jokes are on the
  etiquette, on vanity, on the franchise, on the owner's wallpaper, never the regulars, the poor, or the injured. (4)
  Invented brands only; grep every name. (5) Rescued people have agency (a kid in the youth club can refuse her). (6)
  Adult, not explicit.

## 10. Engine touchpoints

| File | Change |
|---|---|
| `types.ts` | `GenRole` and `Location.kind` gain `gym` + room roles; `gen.variant/shell/size/condition/tier/traits[]/situation?`; `Location.ladder?`; `Hero.sore` |
| `mapgen.ts` | `KIND`, `BLURB`, `nameFor`, security rules; `GYM_CHANCE`; gym stream in `expand` (street) and `case 'gym'`; faction `v:<id>` |
| `content/gyms.ts` (new) | Variants, shells, traits, situations, features, rooms (data only; all appendable) |
| `content/archetypes.ts` | gym roles (owner, trainer, regular, sparring_regular, pit_fighter, pit_boss, instructor, front_desk, ...) |
| `roster.ts` | `ROSTERS.gym` + `variants` / `traits` filters; room rosters by role |
| `gym.ts` (new) | `gymCandidates` and the affordance table machinery; ladder, soreness, tune-up |
| `affordances.ts` (new, shared) | **The schema type and the registry**, shared by every location. See §12. |
| `hustles.ts`, `combat.ts`, `shutdown.ts`, `stage.ts`, `graffiti.ts`, `text.ts` | as the earlier draft: shifts, non-lethal kinds, owner-dead shutdown, prestige, rates, templates |
| `scripts/` | `npm run gyms` (batch preview), `npm run coverage` (§12) |
| `components/NightViewer.tsx` | per-kind labels for `gym` |

## 11. Tests

Deterministic per seed · existing maps unchanged (compare street ids before/after) · variant weights respect districts ·
unique names in a batch · every blurb resolves its tokens · training/fatigue/soreness · spar and ladder are non-lethal ·
pit kill needs a matching kill goal · owner dead shuts the gym · every new event has text · long-run sims still finish ·
**coverage test**: every skill in `SKILLS` has at least one affordance reachable at *some* gym (§12).

## 12. Coverage: keeping locations complete as capabilities grow

`affordances.ts` exports `AFFORDANCES` (an append-only registry, one array per location type, each row following §7.1).
`npm run coverage` reads the live `SKILLS`, stats and drives and prints a matrix of capability × location type:

```
              gym  bar  shop  club  home  street ...
melee          ●●●  ●    -     ●     -     ●
sneak          ●●   ●    ●     -     ●●    ●
tinkering      ●●   -    ●●●   -     ●     -
... 
UNCOVERED at this location: <list>
```

- **New location protocol:** after writing the spec, run coverage; any capability that sees nothing at the new location
  gets at least one affordance (maximalism, and a lens for every capability).
- **New capability protocol (new skill, stat, drive, implant, archetype):** run coverage; add affordances to every
  location type that reads as natural for it, and note which locations still don't.
- The matrix is informative, not a gate on balance: gaps are listed for the author to fill, not rejected.

## 13. Open items

1. **Pit bets** (fight only in v1?) and **whether a ban spreads** between gyms.
2. **Affordance registry shape** (`affordances.ts`): one registry for all location types, or one per type? Proposed: one
   shared type + one registry per location type, aggregated by the coverage script.
3. **Atlas franchise variant** was left out in the first pass; reinstated here under maximalism (strike if unwanted).
