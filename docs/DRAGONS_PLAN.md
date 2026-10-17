# Dragon batch 2: implementation plan

Status: **built** (see "As built" at the end for where the plan changed). Feel over balance: every number below is a first guess, to be tuned by feel (or not at all).

Adds nine archetypes in four new families, plus the one Artemis variant:

| Archetype | Model | Behavior | Grade |
|---|---|---|---|
| `hermes` | Hermes Mk. I | Light courier flyby. Catchable, fragile. | 8 |
| `hermes3` | Hermes Mk. III | Courier with valuable cargo. Cannot be caught on foot, so effectively unkillable until vehicles exist. | 30 |
| `demeter` / `demeter2` / `demeter3` / `demeter4` | Demeter Mk. I-IV | Roaming "bounty" dragon: demands tithes. Always winter. | 14 / 24 / 36 / 50 |
| `artemis2` | Artemis Mk. II | Hunter of high Atlas heat. Tracks her across locations. | 22 |
| `ares2` | Ares Mk. II | Gang buster. Raids gang-active places, attacks anyone near a gang. | 28 |
| `ares4` | Ares Mk. IV | Same, faster than she can run, preceded by a scream that means "get inside". | 48 |

Reference points: Artemis Mk. I is grade 12 (hp 210, power 38); Hera is grade 60 (hp 8000, power 900); the CEO is 80. See `engine/src/grade.ts`.

## What exists today (what we are extending)

- `engine/src/dragons.ts`: `ambientDragons` spawns a `w.flight` (`Flight`, `types.ts:603`) of `kind: 'artemis' | 'hera'`. It runs every beat from `run.ts:187`. The hero gets a few beats to **engage / hide / gawk / film** (`dragonCandidates`). A flight expires after `until` beats or when she leaves, and its tmp NPCs are killed.
- Dragons are ordinary NPC archetypes (`content/archetypes.ts:324-340`, tagged `robot`+`dragon`, faction `atlas`) fought through `fight()` (`combat.ts`, tactics in `tactics.ts`). Foes can already flee (`foe_flees`, `tactics.ts:803`).
- The text layer keys everything on the event type plus a variant (`dragon_flight:artemis` etc. in `text.ts:821-853`), and fight text branches on `d.dragon` (the archetype id, `combat.ts:225`). There is a test that every event kind has templates.
- Atlas heat: `w.heat.atlas`, added by `addHeat` (`combat.ts:60`), read by `heatLevel` (`laylow.ts:20`). At atlas heat >= 5 outdoors there is already a 15% "retrieval team" ambush (`run.ts:300`).
- Gangs: factions with `kind === 'gang'` (`factions.ts`), `Location.influence` (faction -> share, `types.ts:390`), `situation.warringGangs`, NPC tag `ganger`. Social graph: `w.ties` (kin/friend/rival/crew/boss/partner, directed, `ties.ts`).

## Design: generalise `Flight`, don't fork it

All five behaviours are still "something Atlas flies over and she must react to", so they stay `Flight`s. The model-specific rules live in a table; text keys are per family, with the mark as data.

```ts
// types.ts
interface Flight {
  kind: 'artemis' | 'hera' | 'hermes' | 'demeter' | 'ares';   // family: text key + behaviour
  mark: 1 | 2 | 3 | 4;                                         // new: shown in text, picks stats/tuning
  phase?: 'scream' | 'demand' | 'raid' | 'track';              // new: behaviour-specific state
  // ids, locationId, until, hidden, noticed: unchanged
}
```

New `engine/src/dragonmodels.ts`: one table, `DRAGON_MODELS[archetype]`, giving family, mark, behaviour, traits (`swift`, `relentless`, `tracks`, `screams`), spawn rule and pack size. `ambientDragons` becomes a dispatcher over it; behaviour code goes in small files in the repo's flat style (`tithe.ts`, `gangbuster.ts`) and `dragons.ts` keeps the shared flight lifecycle. Existing Artemis Mk. I and Hera behaviour must not change.

**RNG gotcha.** New spawn rolls in `ambientDragons` shift the seeded RNG stream for every later draw in a beat, which would change every seeded run and any fixture or golden test. Draw the new rolls from a derived `Rng` (the repo already seeds a separate `Rng` per concern in `world.ts`, e.g. for the arsenal) so existing seeds keep their stories. Verify with `npm test` before and after.

## Phase 0: foundation (no visible behaviour)

1. `Flight.mark` / `phase`; widen `kind`; `spawnFlight(c, kind, count)` takes an archetype id.
2. Archetype defs in `content/archetypes.ts` (stats below), new `names` generators with callsigns (extend the `names` union at line 13, the machine check at ~567 and the name function at ~537):
   `HERMES-###`, `DEMETER-<mark> "<TITHE-ish callsign>"`, `ARTEMIS-###` (reuse), `ARES-###`. Per `docs/setting/naming.md`, matter-of-fact model names, evocative-but-slightly-too-edgy callsigns for the ones that matter (e.g. `HERMES-III "NEXT-DAY"`, `DEMETER "TITHEMOTHER"`, `ARES-IV "QUIET HOURS"`).
3. Loot items in `content/items.ts` (scale and plating per family: courier plating, harvest plating, Mk. II hunter optics, gang-buster ram plate). Generalise the Artemis fame/counter at `combat.ts:432` to any `dragon` tag; keep `artemis_kills`.
4. Anywhere that special-cases `'artemis'` or `'hera'` by name gets a family lookup: `pursuit.ts:414-440` (`proxyFoe('artemis')` for readiness), `traits.ts:39`, `laylow.ts:56` and `goals.ts:84,87` (candidate-key sets), `clock.ts:31` (action minutes), `hobbies.ts`, `interactions.ts`, `extras.ts`, plus the analysis scripts (`scripts/analyze/*`, `components/NightViewer.tsx`, `components/Lab.tsx`) if they enumerate dragon variants.
5. Text scaffolding for each family (flight, pass, notice, engage, hide, gawk, film, fight intro/win/loss, broadcast) so the "every event has templates" test stays green as each phase lands.

## Archetype stats (first guess, ~1.2x the `basePower` / `baseHp` curve like Artemis I)

| Archetype | Level | HP | Power | Loot | Notes |
|---|---|---|---|---|---|
| `hermes` | 8 | 100 | 18 | courier plating | Tag `swift`. Flees at ~half HP (the tactics layer already supports foes fleeing), so a kill has to be earned. |
| `hermes3` | 30 | 900 | 120 | (cargo, see below) | Tags `swift`, `untouchable`. Real stats exist so the future vehicle fight works. |
| `demeter` | 14 | 260 | 50 | harvest plating, purse | The purse is cash: killing a Demeter pays out what it has collected. Purse scales with mark. |
| `demeter2` | 24 | 520 | 92 | as above | |
| `demeter3` | 36 | 860 | 165 | as above | |
| `demeter4` | 50 | 1350 | 270 | as above | |
| `artemis2` | 22 | 460 | 82 | hunter optics, plating | Tags `dragon`, `artemis` (so scalps/fame count), `tracks`. |
| `ares2` | 28 | 650 | 115 | ram plate | Tag `gangbuster`. |
| `ares4` | 48 | 1700 | 320 | ram plate, scream core | Tags `gangbuster`, `relentless` (no fleeing), `screams`. |

All are `dragon`, not `boss`, so they don't trigger the cordon logic in `combat.ts:383`.

## Phase 1: Hermes

**Hermes Mk. I** ("Same-Day Safety"): spawns like a flyby (outdoors, rare, 1-2). Reaction set is the standard four (engage / hide / gawk / film). Low notice chance since it isn't looking for anyone, it is looking for addresses. Broadcast: "YOUR SAFETY HAS ARRIVED. SIGN HERE." and it fines you for not being home.

**Hermes Mk. III** (always delivering something valuable; can't be caught on foot):
- Flight flagged `untouchable`. `dragonCandidates` replaces `engage_flight` with **`chase_flight`**: drives greed/pride/bravery, runs for a few minutes, trains `athletics`, and always ends with it already gone (`dragon_chase` event, bad/mixed). It never enters `fight()`.
- Cargo is rolled when it spawns and shown on **gawk / film / chase** (a sealed Atlas payroll case, a cooler of organs on ice, four hundred doughnuts, a CEO's dry-cleaning). Greed is what makes the chase tempting; failure is the joke. Filming it earns bonus fame; spotting the cargo can set a small rumor flag.
- **Speed, not a flag.** Every dragon has a `speed` (`dragonmodels.ts`, the fight board's tiles-per-round scale; Blackbird is 3-7 via `heroSpeed`). `swift` dragons won't hold still: `chase_flight` runs her at it for a few beats (`runsDown`: she must gain enough on it to close the head start). Mk. III is 12, so on foot she never does. When she gets faster or gets a vehicle, `heroSpeed` is the one thing that changes.
- Goals: a hunter on a `dragon` goal (`goals.ts:390`) must not count this as huntable. `pursuit.ts:314-317` gives `engage_flight` a big bonus on a `take` verdict, so `untouchable` flights are excluded from that logic.

## Phase 2: Demeter (the bounty dragon)

**Season.** `demeterSeason(w): 'summer' | 'winter'` always returns `'winter'`. Summer (distribution) exists in the table and text but is unreachable, with a test pinning winter. The joke runs on the broadcast: it opens on the summer script ("SUMMER DISTRIBUTION IS NOW ARRIVING IN YOUR DISTRICT") and corrects itself mid-sentence to "...POSTPONED DUE TO INSUFFICIENT PRODUCTIVITY. YOURS." Everything is her fault.

**Spawn.** Outdoors, roaming, not the overpass. Which mark spawns depends on the place's danger grade (`dangerOf`): Mk. I in the starting district, II-IV deeper. Chance is nudged up by how much cash she's carrying (it smells money). One dragon, no escort.

**The encounter** is a *demand*, not a fight. On notice, the flight enters `phase: 'demand'` with a short window (about 3 beats) and a tithe amount: `max(floor[mark], cash * rate[mark])` with rates around 25 / 35 / 50 / 70%. Candidates (all new keys; register them in `traits.ts`, `clock.ts`, and the `laylow`/`goals` sets):

| Key | Who picks it | What happens |
|---|---|---|
| `pay_tithe` | cautious / smart heroes | Cash drops by the amount; the dragon moves on; Atlas heat -1 ("good citizen"). |
| `haggle_tithe` | charm / quick-talkers | Skill check (speech/charm). Success halves it; failure counts as refusal. |
| `refuse_tithe` | brave / proud heroes | Refusal. |
| `hide_flight`, `film_flight`, `gawk_flight` | existing | Hiding works at normal odds (it is roaming, not tracking). |

**Refusal = "threatening public security."** `fight(c, [demeter], { cause: 'a refused tithe', joiners: false })`, plus +1 Atlas heat; the dragon opens fire. **Doing nothing until the window closes counts as refusing** ("SILENCE IS NON-COMPLIANCE"), which is also how an AI that never picks a response behaves.

**Broke.** If cash is below the floor: it takes what she has, adds a `tithe_debt` counter (the next Demeter's demand is bigger), and lectures. If she has literally nothing it fines her HP a little ("NON-CONTRIBUTOR CITATION").

**Kill.** Pays out its purse. Hunting one is lucrative, so it works as a greed-driven target with a built-in grudge. Rewards scale with mark.

Mk. II-IV are the same code with the stats and rates above.

## Phase 3: Artemis Mk. II (the heat hunter)

- **Spawn:** `w.heat.atlas >= 3`; per-beat chance grows with heat (about `0.004 * heat`, capped ~5%); pack of 1 at heat 3-7, 2 at 8+. Unlike Artemis I it is not limited to outdoors, and it ignores the "ambient early beats" guard once she is hot. Existing `scoutSaves` can still warn her.
- **Better at finding her:** notice chance about `0.3 + 0.03*heat - 0.25*sneakBonus` (floor ~0.12) vs Mk. I's flat ~12%; hide chance reduced by ~0.25 (thermal optics).
- **Better at chasing her:** `phase: 'track'`. In `ambientDragons`, if she leaves the flight's location and the flight tracks, it follows to her new location with ~70-85% chance (`dragon_follow` event, bad), extends `until` by 2 (cap ~14 beats total), instead of expiring. Lying low indoors reduces notice but doesn't make her invisible (full integration with `laylow.ts` is a later pass).
- Killing one adds a little Atlas heat (they send more). Lopsided, but it feels right: don't tune.
- Hunting-goal readiness (`pursuit.ts` `proxyFoe`) gets a Mk. II proxy so a hunter knows it is the harder kind.

## Phase 4: Ares (the gang buster)

### Who it goes after

Everyone. It does not check. Each beat of a raid it picks a few of the people present at random (not gang members: whoever is there), names a gang at random and accuses them of belonging to it. Passers-by (ephemeral NPCs) die; people who matter are downed for a while. It rolls for her the same way, hidden or not, and an empty street makes it likelier to turn on her. (An earlier draft scored people by their social-graph distance from gangs; dropped. The joke is that it doesn't discriminate.)

### Where it goes

`gangActivity(w, loc)` = sum of gang shares in `loc.influence`, plus a bonus if the place's gangs include a `situation.warringGangs` pair, plus a bonus for a recent `gang_brawl`. Mk. II spawns at (or flies to) a location with activity over a threshold; chance scales with activity. **Mk. IV** is the escalation: it is dispatched when a place has had repeated Mk. II raids (a `w.counters.ares_raids[locId]` count) or is a warring-gang hotspot. Mk. II does not scream.

### The raid (on-screen only, to keep the sim cheap)

`phase: 'raid'` runs for ~3-4 beats at the hero's location. Each beat it scans `npcsAt(loc)` and rolls each NPC against `gangSuspicion * markFactor`. Hits are downed or killed (1-3 per beat) with `ares_raid` events naming the victims. She is rolled the same way. If she is targeted it becomes a `fight()` (no joiners). Otherwise she can **gawk / film / hide / intervene** as with any flight, and watching a raid is how she learns who is on its list. Afterwards the place's gang influence drops (say -20%), which is the persistent world effect and what eventually ends the escalation. Victims' ties and Atlas opinion take the hit through the existing witness/avenger paths (`witness.ts`, `avengerTick`): confirm the right hook when implementing.

### Mk. IV: too fast to run from, and the scream

- Trait `relentless`: the fight must not allow a `flee` result. The flee rule is in the tactics layer (`tactics.ts`, `result ?? 'flee'` at ~838); add a per-foe/per-fight `noFlee` and make sure the hero AI's flee candidate knows (it should not rate fleeing a relentless dragon).
- **The scream.** When a Mk. IV is dispatched it spawns with `phase: 'scream'`: an `ares_scream` event at her location (and a rumor beat for places in range), then **2-3 beats** before it arrives. During the window she can:
  - `shelter_from_scream`: go inside / stay inside (reuses the `lay_low` mechanism and `hide_flight` timing). Competent, smart heroes favour this (`smart` weight ~2.4, bonus when the power ratio is bad, like Hera hiding).
  - `engage_flight` (existing): the brave/proud/clueless choice, with the existing `risk` from the power ratio.
  - carry on outdoors: she is a target when it arrives.
- Indoors = safe (v1: it doesn't breach buildings). The text should make the rule legible: *the scream means get inside and stay inside*. Staying put through the raid is the cheap option; going out to look, or to prove something, is how you get flatlined.

## Phase 5: tests and docs

**Tests** (no Monte Carlo, no balance tests per CLAUDE.md): archetype table sanity (tags, faction, loot ids exist); spawn gating (Artemis II needs heat, Ares needs gang activity, Demeter always winter); Hermes III never reaches `fight_start` via `engage_flight`, and `chase_flight` ends in "gone"; Demeter pay / haggle / refuse / ignore paths and the broke path; `gangSuspicion` depths and the hero's floor; Ares IV emits the scream before arrival, leaves a sheltered hero alone, and a seeded fight with it never returns `flee`; Artemis II follows a moving hero; determinism (existing seeds unchanged). Add text for every new event type so the template-coverage test passes. Run `npm run typecheck` and `npm test`; no `test:full`.

**Docs:** the dragon table in `docs/DESIGN.md` ("The dragon family", ~line 200), `docs/setting/world.md` ("The Dragon Family"), `docs/setting/naming.md` (new families + callsigns), `docs/PROGRESSION.md` (grades of the new models).

## Open choices (defaults assumed unless you say otherwise)

1. **Hermes Mk. I flees at half HP** (default yes: it's a courier, and tactics already support foes fleeing). If not, it is just a weak, fast flyby.
2. **Mk. IV breaching buildings:** default no in v1; the scream-and-shelter rule is the whole point. A later pass could let it hit a building when she's been sheltering from it too long.
3. **Off-screen raids:** default none; Ares only acts where she can see it, with rumors for the rest. Simulating raids across the whole city is a much bigger change.
4. **Mark spawn spacing** (Hermes I/III, Artemis II, Ares II/IV): the numbering is intentionally gappy; later marks fill in.

## Order of work

P0 foundation, then P1 Hermes, P2 Demeter, P3 Artemis II, P4 Ares, P5 tests/docs. One commit per phase, `npm run typecheck && npm test` green before each commit.

## As built

- **Speed replaces `canPursue`.** `engine/src/dragonmodels.ts` holds the table: family, mark, speed, traits (`swift`, `relentless`, `tracks`, `screams`). `heroSpeed(w)` is her speed; `reachPerBeat`, `runsDown` and the fight board's retreat rule all read it. Speeds: Hermes I 4, Hermes III 12, Demeter 2-3, Artemis II 5, Ares II 4, Ares IV 10 (Artemis I, Hera and Apollo stay 3).
- **Tracking is real movement.** A `tracks` dragon whose target has gone elsewhere moves along `routeTo` a hop at a time, at `speed / heroSpeed` hops per beat of world time, so a long lie-low (120 minutes) lets it cover any distance, and a faster hero would leave it behind.
- **Fleeing.** The fight board blocks her retreat from a `relentless` dragon whose speed is above hers (`Sim.outpaced`). Hermes Mk. I is `skittish` and will bolt when beaten.
- **Ares accuses everyone**, not just people near gangs.
- **Not done, on purpose:** the Mk. II proxy in `pursuit.ts` (a dragon hunter still sizes things up against an Artemis Mk. I); Mk. IV breaching buildings; raids that aren't on screen; letting a sheltering hero see the raid from indoors.
- **Tests:** `engine/src/dragons2.test.ts`. New spawn rolls draw from a stream derived from the seed and beat, so older seeds play as they did.
- **Roaming** (a later pass). Dragons are no longer events on top of her: each is a `Flight` in `w.flights` that flies into a district, follows its pattern (Demeter prowls, Ares rampages until bored, Hermes does a round of deliveries, Artemis sweeps; Mk. II heads for her), takes off and is dropped once it is far enough away. `w.flight` is whichever one she is standing with. `Flight.persist` keeps one from being forgotten and carries it between nights (`legacy.dragons`). Patterns, timings and the 40-minute Ares boredom are in `dragons.ts`; the district is the open streets within four hops (`districtAround`). New events: `dragon_close`, `dragon_near`, `dragon_depart`, `dragon_duck`.
- Hera is the one that doesn't roam; she and any flight set by hand keep the old stationary behavior.
