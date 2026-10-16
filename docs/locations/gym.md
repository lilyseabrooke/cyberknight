# Location spec: Gym / Dojo

**Status:** DRAFT v2 (author answered the open questions; awaiting a final read). Everything below is **PROPOSED** unless
the "Decided" box says otherwise.
Numbers are starting points to be tuned with `npm run sim` / `npm run analyze`, not law.

## 0. Decided (from the intake interview)

- **Concept:** a gym / dojo, where she trains, spars and fights for rank.
- **Shape:** a **lot** (a full place on a street), not a spot.
- **Variants:** boxing gym, dojo, chrome gym (augment bay). *Not* the Atlas fitness franchise.
- **Rooms behind it:** locker room, owner's office, basement fight pit, sauna.
- **People:** retired-champ owner, trainer / sensei, regulars, a rival or a gang's enforcer.
- **Things to do:** pay-to-train, spar with regulars, ladder / tournament, work a shift.
- **Soreness:** yes, a new hero state (see §6.0). Overtraining physically hurts.
- **Techniques:** not in v1. A sensei trains skill XP only; doctrine stays where it is.
- **Pit paper:** most pit fighters have bounties, but she can only collect one by killing the fighter, and killing in
  the pit goes over badly (see §6, Ladder). The pit is non-lethal by house rule; a deliberate kill is possible and costly.
- **Frequency:** about one gym per ten streets.

## 1. Concept (one paragraph)

Neo sells everything as a subscription, including getting hit. The gym is the one place in the city where being
punched is the product. Three flavours: the boxing gym is a grubby classic, the dojo is pompous and strict about
etiquette it invented last year, and the chrome gym is for people who bench-press with hydraulics and need a tune-up
afterwards. It gives Blackbird somewhere to turn spare nights and cash into skill, and a ladder to climb that has
nothing to do with Atlas, which is the point. Atlas shows up only as the wallpaper: a wellness poster, a camera, an
injury plan nobody asked for.

## 2. Placement (how the map grows one)

- **Role / kind:** `GenRole 'gym'`, `Location.kind 'gym'` (types.ts). Rooms are roles `locker`, `office`, `pit`,
  `sauna`; all use kind `gym` and get their own rosters by role.
- **Own random stream.** Rolled on `gym:${worldSeed}:${streetId}`, after the clinic and the spots, exactly like they are.
  So **no existing map changes** and `LOTS` is untouched. (Gyms are not in `districtgen`'s `lots` table; they ride on top.)
- **Chance a street has one**, by district (`GYM_CHANCE`): market 0.05 · nightlife 0.08 · tenement 0.12 ·
  industrial 0.10 · corporate 0.06 · slum 0.08. At 2-4 lots a street that is roughly one gym per ten streets.
- **Variant weights by district** (`GYM_VARIANT`):

  | District | boxing | dojo | chrome |
  |---|---|---|---|
  | market | 2 | 2 | 1 |
  | nightlife | 1 | 1 | 3 |
  | tenement | 4 | 2 | 1 |
  | industrial | 3 | 0.5 | 3 |
  | corporate | 0.5 | 3 | 3 |
  | slum | 4 | 1 | 0.5 |

- **Security:** boxing `1 + rand(0,1)` · dojo `1 + rand(0,1)` · chrome `2 + rand(0,1)` (people lift their savings in
  here). Cameras: default (`security / 2`). Not crowded; `crowded` is 0.25 for boxing, 0.1 for dojo, 0.35 for chrome.
- **Faction:** a venue faction `v:<id>` like bars and clubs (heat, grudges and closure work the same way).

## 3. Variants

Each variant is a bundle: **names, blurbs, skills it trains, day pass, vibe, who it casts, Atlas wallpaper.**
A gym's variant is rolled once from its own stream and stored on `gen.variant`.

### Boxing gym
- **Names** (`GYM_NAME.boxing`): Glass Jaw Gym · The Last Round · Southpaw Social Club · Knuckle Sandwich Boxing ·
  Eight-Count Athletic · Ringside & Co · The Canvas · Corner Pocket Boxing · Sweet Science Supply (and Gym)
- **Blurbs:** "{name}: heavy bags stitched with tape, a ring with one loose rope and a trainer who has said 'again' since before she was born." ·
  "{name}: it smells of liniment and ambition, in that order of strength." ·
  "{name}: a ring, a speed bag, and a framed poster of a boxer nobody will name."
- **Trains:** melee (main), athletics. **Day pass:** 15nd.
- **Atlas wallpaper:** a laminated Safe-T poster, "Atlas recommends consulting a physician before consulting a fist."
- **Vibe:** grubby, warm, underfunded. The owner is proud and broke.

### Dojo
- **Names** (`GYM_NAME.dojo`): The Humble Crane (est. last spring) · Iron Heron Dojo · Way of the Open Palm (Annual Tier) ·
  Sensei Kettle's Quiet Fist · Dojo of the Ninth Belt · The Empty Cup Academy · Still Water Martial Arts
- **Blurbs:** "{name}: shoes off at the door, a spotless mat, and a sign listing nine rules, four of which contradict."
  · "{name}: paper screens, a gong, and a tablet at reception where she is asked to accept the Code of Honour."
  · "{name}: very quiet, very clean, and everyone bows to her at a slightly different angle."
- **Trains:** melee (main), sneak. **Day pass:** 40nd (it's a *discipline*).
- **Atlas wallpaper:** the Code of Honour is on an Atlas-provided terms-of-service tablet; nobody has read past clause 3.
- **Vibe:** pompous, strict, sincere. Joke is the etiquette and the belt colours, never the students.

### Chrome gym (augment bay)
- **Names** (`GYM_NAME.chrome`): Hydraulic Hank's Lift & Lube · Torque & Tonic · Overclock Fitness · Piston Pump ·
  Rig & Rep · Servo Social · Titanium Temple · Rated 11 Athletics
- **Blurbs:** "{name}: lifting rigs with hydraulic spotters, a coolant fountain by the door and a rack of weights labelled in tonnes."
  · "{name}: mirrors on every wall and a man in the corner benching a vending machine."
  · "{name}: half gym, half pit lane, and everyone is mid-upgrade."
- **Trains:** athletics (main), melee. **Day pass:** 55nd, 10nd more in corporate districts. **Extra:** a "tune-up" add-on
  (see Activities) that heals a little and is the only place a minor implant glitch gets looked at.
- **Atlas wallpaper:** a "Care+ Injury Plan" kiosk that offers her cover for injuries she hasn't had yet.
- **Vibe:** shiny, loud, a little vain. Punches up at the idea of buying your body in instalments.

## 4. Rooms behind it

Child rooms of the gym, born when it's expanded (`expand`, new `case 'gym'`), like a bar's backroom and cellar.

| Room | Chance (boxing / dojo / chrome) | Gate | Hidden | Security | What it's for |
|---|---|---|---|---|---|
| Locker room (`locker`) | 0.9 / 0.9 / 0.9 | open | no | parent | Stash and steal: lockers are small caches. People gossip here. |
| Owner's office (`office`) | 0.5 / 0.4 / 0.5 | guarded | no | parent + 2 | The till, the ledger, the owner's secrets. Where protection money and Atlas audits turn up. |
| Fight pit (`pit`) | 0.35 / 0.1 / 0.25 | guarded | yes (0.7) | parent + 1 | Underground fights. Higher stakes, bets from the crowd. The ladder's top rung lives here. |
| Sauna (`sauna`) | 0.3 / 0.5 / 0.5 | open | no | 0 | Calm: nobody starts anything. **Eases soreness** (§6.0), plus talk, deals, rumours, a little romance. |

- **Names:** `{owner}'s office`, `{gym}'s locker room`, `the {gym} pit` (dojo: "the Lower Hall"; chrome: "the Cage"),
  and "steam room" (chrome: "coolant sauna").
- **Rooms of the gym are non-lethal** (see Engine touchpoints) except the pit, which is non-lethal *by the house rule*
  (the pit boss checks her at the door) so a fight there is a beating, not a death. Death is a rebuild; the pit is a
  show.

## 5. People

New archetypes in `content/archetypes.ts`, cast by role per room in `roster.ts`. Rosters get an optional
`variants?: string[]` filter on a slot so a dojo casts a sensei where a boxing gym casts a coach.

| Role | Lvl | Tags | Where | Notes |
|---|---|---|---|---|
| `gym_owner` | 5-6 | owner, strong, staff, nonlethal | gym floor (resident) | Retired champion. Proud, underfunded, knows everyone. Killing them shuts the gym (like the Halo). Carries a championship belt (loot, worth ~120nd). |
| `trainer` | 3-4 | staff, strong, nonlethal | gym floor (resident) | Boxing: coach · dojo: sensei · chrome: rig-tech. Trainer quality (level) scales XP. Likes her more as she improves. |
| `gym_regular` | 1-3 | ephemeral, nonlethal | gym floor | Bystanders. Rotating. Sparring partners and gossips. |
| `sparring_regular` | 2-4 | nonlethal | gym floor (resident) | The few regulars who'll actually spar her. Remember wins and losses (bonds). |
| `pit_fighter` | 4-6 | nonlethal | pit (resident) | The ladder's rungs. One per rank. **Paper:** 70% carry a bounty (`bounty.ts`), about half of those hidden. The `nonlethal` tag is the house rule; see Ladder for what breaking it costs. |
| `pit_boss` | 5 | strong, staff, nonlethal | pit / office | Runs the book. Hostile if she cheats. |
| rival enforcer | - | - | gym floor, chance 0.25 | An existing `ganger` slot (`faction: 'influence'`): a gang collecting protection or poaching the trainer. A story hook, not a new archetype. |

Names via the person generator, never hand-named (naming.md). `desc` lines are written per role, with per-variant
variants where it matters (a sensei is "a very upright woman in a belt that has seen things").

## 6. Things to do (candidates, in the style of `hobbies.ts` / `features.ts`)

All of these are `Candidate`s generated from `gymCandidates(w)` in a new `gym.ts`, wired into the same candidate pool
as `hobbyCandidates` and `featureCandidates`. Limits come from the world, never from a cooldown.

### 6.0 Soreness (new hero state)
- **State:** `Hero.sore`, 0..1. Training adds to it (`+0.18` a session, `+0.08` a spar, `+0.12` a ladder bout); it
  recovers with time (`-0.004` a beat, like `RECOVERY` in stage.ts) and faster resting at home or in a sauna
  (`-0.04` a beat in the sauna).
- **Effect:** fighting power is scaled by `1 - 0.25 × sore`, and `maybeInjure`'s chance is scaled by `1 + sore`. A
  sore, over-trained Blackbird loses fights and breaks things; a rested one doesn't.
- **Threshold:** above `0.6` she will not volunteer to train (the drive drops), but the player/AI can still choose to.
- **Interplay with fatigue:** fatigue is the *gym's* patience (diminishing XP per gym per skill); soreness is *her*
  body (a cost carried to the next fight). Different limits, both from the world.

### Train (pay a day pass)
- **Availability:** a gym floor, the trainer alive and not hostile, and `cash >= pass`.
- **Cost:** the variant's day pass (above), paid to the owner (goes in the till).
- **Effect:** `train(c, skill, xp)` for the variant's skills, with XP of `2.0 × trainerQuality` where `trainerQuality`
  is 0.7 + 0.1 × trainer level. The skill's `spill` does the rest.
- **The limits:** the existing **fatigue** model (`stage.ts` `freshness`): each session tires "the floor" for that
  skill (`loc.fatigue`), so repeat sessions at the same gym pay less XP until it recovers. And **soreness** (§6.0):
  each session leaves her sorer. She spreads her training across gyms and skills and rests between. No timer anywhere.
- **Chrome add-on, "tune-up":** +heal 10 and the glitch fix, for 25nd, same fatigue rule.

### Spar with a regular
- **Availability:** a `sparring_regular` present, not hostile.
- **How:** a normal `fight` with the `nonlethal` tag (they have it), stakes: XP in melee + athletics (half of a full
  session), small affinity change, and a chance of `bondEvent` (a friend or a grudge, depending on how she did and how
  she behaved). Losing means a knockdown (`downUntil`), not a death.
- **The limits:** their patience, her HP, and soreness (+0.08, and a sore sparrer fights worse). Sparring is a real fight: she can get hurt.

### Ladder / tournament
- **State:** `loc.ladder = { rank, wins }` on the gym (0 = unranked, top = the pit fighter, 5 rungs in a boxing gym,
  3 in a dojo's "belt trials", 4 in a chrome gym).
- **Availability:** she has paid a 20nd entry, a rung above her is free, and the opponent is alive.
- **How:** a nonlethal fight with `pit_fighter` of that rung's level. Purse: 30nd × rung. Win = rank up, fame via
  `fameFrom` (`stage.ts`), a rival who now remembers her. Lose = no purse, rank unchanged, entry fee gone.
- **Killing in the pit.** The house rule is a beating, not a death, and the fighters carry the `nonlethal` tag. She
  *can* kill one, the way a bar's owner can be killed: only with a `kill` goal aimed at exactly that fighter (the
  `marked` rule in `combat.ts`). Then she collects the bounty (if the fighter had paper) and the pit turns on her:
  the pit boss and the crowd go hostile, the gym's heat jumps, she is barred from the gym (shut to her, not shut for
  good unless the owner is the victim), the ladder is wiped and the owner's affinity drops through the floor. The
  paper is real money and the price is steep, so it's a choice, not an accident.
- **Top rung:** needs a pit (the pit boss books it). Beating the top rung earns the gym's belt; the owner offers her a
  regular wage ("the champ drinks free") and the gym becomes friendly. (One belt per gym, so it stays rare.)
- **The limit:** the entry fee, her HP, and finite rungs.

### Work a shift
- **A hustle** in `hustles.ts`: front desk, towel duty, or being a sparring dummy for 12-25nd. Open shifts accrue while
  the gym is busy (like `chores` / `doorSlots`), cap 2. A wary room refuses her (the `wary` map).
- **Side effect:** overhear a rumour (existing `knowledge`/`facts`) on the shift.

## 7. Setting texture and hard rules

Texture checklist (world.md): fee ✓ (day pass, entry fee, Care+ plan), brand ✓ (name tables), Atlas presence ✓ (poster,
terms tablet, kiosk), specific number ✓ (15/40/55nd, rung levels, 120nd belt).

Hard rules (README.md):
1. Blackbird opposes Atlas: ✓ nothing here is Atlas-run; Atlas is wallpaper she can disdain.
2. Nothing grim: ✓ the pit is a show, defeat is a knockdown, death is a rebuild.
3. Punch up: ✓ the jokes land on the etiquette, the belt colours, the vanity of rigs and on Atlas's injury plan. The
   regulars are never the punchline. The owner's brokeness is warm, not a joke on poverty.
4. Invented brands only: ✓ all names are invented; **grep each before commit** (naming.md).
5. Rescued people have agency: n/a (no rescues). The trainer can refuse her, and the owner can throw her out.
6. Adult, not explicit: ✓ the sauna is about talk, not about anything on the floor.

## 8. Engine touchpoints (what the implementation will edit)

| File | Change |
|---|---|
| `types.ts` | `GenRole += 'gym' \| 'locker' \| 'office' \| 'pit' \| 'sauna'`; `Location.kind += 'gym'`; `Location.gen.variant?`; `Location.ladder?`; `Hero.sore` |
| `combat.ts` (soreness) | scale hero power by soreness; scale `maybeInjure`'s chance by soreness; recover per beat |
| `bounty.ts` | pit fighters get paper at a higher chance (0.7); no change to collection (a kill still pays) |
| `mapgen.ts` | `KIND`, `BLURB`, `nameFor`, security / crowded rules in `sketch`; `GYM_CHANCE` + a gym stream in `expand` (street); `expand` cases for `gym`; faction `v:<id>` for the gym |
| `content/gyms.ts` (new) | Variants: names, blurbs, skills, passes, room chances, ladder ranks, Atlas wallpaper |
| `content/archetypes.ts` | `gym_owner`, `trainer`, `gym_regular`, `sparring_regular`, `pit_fighter`, `pit_boss` |
| `roster.ts` | `ROSTERS.gym` slots; optional `variants` filter on `SlotDef`; room rosters by `gen.role` |
| `gym.ts` (new) | `gymCandidates`, `train`/`spar`/`ladder` actions, ladder state, tune-up |
| `hustles.ts` | gym shift (open slots in `tickHustles`) |
| `combat.ts` | `isLethal`: gym kinds are non-lethal places (like bar / club / shop / home) |
| `shutdown.ts` | owner dead -> gym shuts; stays shut like a bar |
| `stage.ts` | `prestige`: gym 0.9, pit 1.3 (stage fame), fatigue works as-is |
| `text.ts` | templates for every new event (train, spar, ladder, shift, tune-up, belt) in both voices |
| `graffiti.ts` | gym graffiti rate (0.3) and a few gym-appropriate lines |
| `scripts/` | extend `npm run districts`-style tooling: `npm run gyms` prints a batch of gyms |
| `components/NightViewer.tsx` | any per-kind icon / label switch needs `gym` |

## 9. Tests

- `gym.test.ts`: deterministic per seed; no existing map changes (compare a pre-gym world's street ids against a new
  one); variant weights respect districts; room chances; names are unique within a batch; every blurb has `{name}`.
- Training: XP rises, fatigue cuts the second session's XP, a broke hero can't train.
- Spar / ladder: nonlethal (no death), rank moves on a win, a loss costs the fee only, top rung needs the pit.
- Soreness: rises with training, recovers over time and faster in a sauna, trims fight power, raises injury chance, and
  old saves without `sore` load as 0.
- Pit kill: only with a matching kill goal; pays the bounty; the pit goes hostile and she is barred.
- Shutdown: owner dead -> gym shut; `isLethal` is false inside.
- Text: every new event has a template; no unresolved `{...}`.
- Whole-night sim: the gym doesn't break the long-run tests (`npm run test:full`).

## 10. Open questions for the author

Answered: soreness (yes), techniques (not in v1), pit paper (bounties, collect only by killing, which is costly),
frequency (1 in 10).

Still open (defaults proposed; say if you disagree):
1. **Pit bets.** Can she bet on pit fights (the crowd), or only fight in them? Proposed: fight only for v1.
2. **Does a ban from one gym spread?** Proposed: only that gym, plus a rumour other gyms of the same owner's
   network (none yet) may hear later.
