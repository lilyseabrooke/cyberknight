# Combat progression: the long game

Status: **design sketch, nothing implemented.** Written against the engine as of `558937e`. Per the "feel over balance"
stance in `CLAUDE.md`, every number here is a starting guess to be felt out, not a target to be balanced.

## Goals

- Skills run to 100. The game is **cleared around 80** and is meant to take a very long time. 100 is technically
  reachable but very difficult.
- The strongest enemies sit around **80**. Ordinary endgame mooks sit around **70**.
- The world has a **smooth danger gradient** (neighbouring places have related danger) with noise and the occasional
  big outlier, so Blackbird generally progresses as she goes.
- CINDERJAW stops being the endgame boss and becomes the **gate off the starting district**, which is itself much larger
  than today's: the hand-authored places are about 10% of it and the rest is generated as she explores.
- The game is a roguelike: **everything resets on death, by design**, and that is why reaching 80 takes so long. The game
  ends when Blackbird dies. There is no victory condition, and none is needed for a long while.
- The lab tree is out of scope here (it will need a rework), but the hooks it needs are listed at the end.

## Where things stand

| Thing | Today | File |
|---|---|---|
| Skill level | `sqrt(xp/2)`, capped at 10 (implants and held weapon add up to a ceiling of 12) | `skills.ts` `skillValue` |
| Skill combination | weighted geometric mean of skills and stats on a 0-10 scale; any zero factor gives zero | `skills.ts` `synergy` |
| Odds | `odds(base, perPoint, synergy)` is about `base + 0.06 x synergy`, clamped to 0.03-0.93; older code uses inline `clamp(...)` | `hobbies.ts`, `stage.ts`, `placekit.ts` |
| Combat power | `level x 2 + muscle + weapon + weaponSkill x 0.6`; skill adds at most 6 | `combat.ts` `heroPower` |
| Enemy stats | `hp = 18 + 12 x level`, `power = 2 x level + weapon`; bosses hand-set | `content/archetypes.ts` `spawnNpc` |
| Danger on the map | street `depth` plus district type gives a dungeon `tier` of 1-5, which scales garrisons | `content/dungeons.ts` `rollTier`, `scaleForTier` |
| Hero level | `24 x level` XP per level, one stat per level | `combat.ts` `gainXp` |
| Persistence | skills are **per run**; the lab restores starting skill levels | `lab.ts` `applyUpgrades`, `universe.ts` |
| CINDERJAW | level 10, power 105, hp 1100; killing her sets `ending = 'victory'` | `combat.ts` ~383 |
| Starting district | 22 hand-built locations, three roads out into generated Neo | `world.ts`, `mapgen.ts` `ANCHORS` |

## 1. One grade scale

Skill level, enemy threat, location danger and gear tier all use one unit, the **grade**, 0 to unbounded (soft ceiling at
100). "Melee 30 versus a grade-30 enemy" means something.

Anchors:

| Grade | Means |
|---|---|
| 0-15 | the starting district, rising from the middle (the Halo) toward its edge |
| 15 | CINDERJAW (the gate) |
| 18 | first streets past the cordon |
| 40 | mid-game outskirts |
| 60 | Hera Mk. V |
| 70 | ordinary endgame mooks |
| 80 | the Atlas CEO, the final boss and the top-difficulty benchmark; roughly where the game is "cleared" |
| 100 | skill ceiling in practice; enemies only get here through stacked outliers |

The CEO (see `docs/setting/board.md`) is not in the game yet, but the curves are anchored on her: grade 80 is "as hard as
she is". Hera at 60 is a late-mid threat, not the wall she is today. A 70-grade mook out-grades her, but she is a boss,
so her multiplier keeps her far stronger than any mook until Blackbird is well past 60.

Conversion curves (illustrative):

```
power(g) ~ 2.5 * g * (1 + g/40)      g=10: 31   g=20: 75   g=40: 200   g=70: 480   g=80: 600
hp(g)    ~ 18 + 12 * g * (1 + g/60)
```

Bosses are a grade plus a multiplier (CINDERJAW grade 15 with x2 power and x4 hp; Hera grade 60 with a large
multiplier; the CEO grade 80 with the largest). Hand-set hp and power in `ARCHETYPES` get replaced by
`grade + bossMultiplier`.

## 2. Skills to 100

- XP curve: `xp(L) = 2 L^2` up to level 10, so existing saves and low-level tests do not move. Beyond that it steepens:
  `xp(L) = 2 L^2 (L/10)` (L=50: 25k, L=80: 102k, L=100: 200k). It is a function in one place, so it is easy to retune.
- `synergy()` takes `level/10` as its input, so every existing weight, base and slope keeps its meaning at low levels,
  and a high skill saturates against the existing 0.93 `odds` clamp. Social and hobby odds at high levels are therefore
  flat. That is acceptable.
- **Opposed checks.** Pickpocket, threaten, sneak, lockpick and similar checks that touch a target subtract the target's
  grade, the way `n.level x 0.05` already does in a few places. This is what makes high-grade districts feel different
  for non-combat skills too.
- **Titles.** The four title slots (levels 1/3/5/8) grow to about ten, so the log has something to say up to the top.
- **Training.** `train()` keeps its shape, but fights become the main source of XP for combat skills: XP is proportional
  to the enemy's grade relative to hers (nothing for trivial enemies, most for slightly harder, little for far harder).
  `combat.ts` already has a version of this for hero level (`over x 0.15`).

## 3. Combat power from skills

`heroPower` moves to the grade scale:

```
power = curve(weaponSkill grade) x gearMultiplier(weapon grade) + stats + implants + buffs + allies - penalties
```

The hero `level` stops being the main source of power. Weapons carry a grade (`genWeapon` already takes a float tier),
armor likewise, and loot tables are indexed by grade.

## 4. Level and stats

Decision (the author deferred this to me): **hero `level` becomes a derived headline**, not a separate XP track.

- `level` = the mean of her best five skills (rounded). It is shown on the status panel and used for the run report, and
  it replaces `h.level` in the odd formula (intimidation, pickpocket) that reads it.
- `gainXp` stays as an event hook but pays out as combat-skill XP, not as a level.
- Stats (`muscle`, `reflex`, `hack`, `charm`) grow on the same 0-100 scale and **by use**: muscle from melee, athletics
  and intimidation; reflex from shooting, athletics and sneaking; hack from tinkering and lockpicking; charm from the
  social group. A helper `stat10(h, 'charm')` returns `stat/10`, so existing inline formulas (`h.charm x 0.03`) keep
  working unchanged until they are individually retuned.

## 5. The danger field

Danger is a number on every generated street (the starting district's included, see section 6), stored as `gen.danger`, and lots, dungeons and spots inherit their
street's. It is a **mean-reverting random walk down the street tree**:

```
mean(depth)      = 18 + 52 * (1 - exp(-(depth-1) / 14))     // 18 at depth 1, ~44 at 10, ~58 at 20, plateau 70
street.danger    = parent.danger + 0.35 * (mean(depth) - parent.danger)   // drift toward the local mean
                 + gaussian(sigma ~3.5)                       // everyday noise
                 + districtBias[type]                         // corporate/slum +, market -
                 + spike                                      // ~1 in 12 hops, +/-(10..25): a hot pocket or a surprising quiet one
```

- Inside the starting district the walk is different: it ramps from about 2 at the Halo to about 15 at the cordon
  (`2 + 13 x depth/startDepth`, same noise and spikes), so the district is a gentle slope into the gate. The hand-built
  set pieces sit where they sit and keep their own grades (Helix about 8-10, the Overpass 15).
- Streets are already a tree (`childId`, `gen.parent`), so neighbours are related, walking back toward the Halo gets
  safer, and spikes make cliffs you can see coming.
- The plateau at 70 is the "endgame mooks" level. Elites (+10) and the apex machines give the 80s. Past 100 happens only
  when a spike lands on an elite, which is rare. It is unbounded by design, not by a hard clamp.
- Own seeded rng stream (like `clinic:` and `spots:`), so existing maps do not reshuffle.
- Dungeon `tier` becomes a bucket of `danger` (so `TIER_MENACE`, `LEADER_ARMS` etc. keep working while they are
  re-indexed), and `rollTier` goes away.
- Enemies: `ArchetypeDef.level` becomes a rank offset (drifter -5, staff 0, strong +3, commander +5, boss +15);
  `spawnNpc` takes the local grade; `scaleForTier` is replaced by the curve.

## 6. The starting district and the lockdown (CINDERJAW as gate)

**A bigger starting district.** Today the hand-built set is 22 locations. The starting district becomes roughly ten times
that, around 200 locations, with the hand-authored places (the Halo, the club, Helix, the Overpass and so on) as about 10%
of it and the rest generated lazily as she explores, by the same `expand` machinery as everywhere else.

- The three `ANCHORS` in `mapgen.ts` stay, but their roads now lead to **other parts of the same district**, tagged
  `gen.zone = 'start'`, instead of out to Neo.
- The district has a size cap: streets stop growing outward at `startDepth` (tune it so the district comes to about 200
  locations, interiors counted; the existing `mapgen` tests can measure that). The outermost streets end in an
  **Atlas lockdown cordon**, a sealed exit rather than a normal street.
- The fiction is that the lockdown is CINDERJAW's: the cordon is held by its control signal, so when it dies the cordon
  comes down.
- The same cap means the district has a finite amount of grade 0-15 content, which is the point; it should feel big
  without being endless.

**The gate.**

- State: a flag on `legacy` (for example `legacy.gate = 'sealed' | 'open'`). `legacy` already persists across runs, so the
  kill carries over for free.
- While sealed, the cordon exits do not open and nothing generates past them. While open, they lead to the rest of Neo
  (`gen.zone = 'neo'`), starting at grade 18 and following the plateau curve in section 5. A run that begins after the
  kill starts with the cordon open.
- Killing CINDERJAW sets the flag, emits the existing victory-style scene (retitled), and **does not end the run**
  (`combat.ts` ~383 stops setting `ending = 'victory'`).
- `RunReport.ending` can keep `'victory'` as a dead enum value until the lab rework.
- Old saves: `upgradeUniverse` (bump `UNIVERSE_VERSION`) tags every existing street by depth, so streets past
  `startDepth` are retroactively behind the cordon, sealed unless the gate flag is set.
- Dragons in the district: Artemis flights are tutorial-grade threats (about grade 10-12). Hera's fly-through stays an
  apocalypse-on-a-timer moment, now one she can in principle outlast late in the game; at grade 60 she needs a hero who
  has reached the far side.
- The intel scenes (fixer, terminal, scientist) stay as they are; they are now the district's endgame prep.

## 7. Resets are by design

Skills, level and stats all reset on death. That is the roguelike's point, and it is why reaching 80 should take a very
long time: the long game is many lives, with the lab handing back a head start each time. So:

- No skill floor or carry-over is added to `legacy`. What survives a death stays exactly what survives today (account,
  upgrades, the world, and now the gate flag).
- The XP curve and the lab have to be tuned together: within one run she is expected to get a long way up the grade
  scale, and the lab's flat nodes (`skill`, `stat`, `level`) are the only thing that lifts her starting point. They are
  priced and capped for 0-10 today, so they are wrong at 100. That, and the tree's shape, is the deferred lab pass.
- Percent perks (`growthPct`) keep working unchanged on the new scale.

## Suggested build order

1. Grade scale and curves as pure functions, with tests of the curve itself (no balance tests).
2. `gen.danger` and `gen.zone` on generated streets, plus a debug view of the field to look at the gradient and spikes.
   The bigger starting district (the three anchors leading into `'start'` streets, the `startDepth` cap and cordon)
   goes in here too, since it is the same map generator.
3. Enemies and loot read the field (`spawnNpc`, `scaleForTier`, `genWeapon`, dungeon tiers).
4. Skills to 100: XP curve, `synergy` rescale, opposed checks, fight XP, titles.
5. `heroPower` on skills, derived `level`, stat growth by use.
6. The lockdown gate and the CINDERJAW change (the legacy flag, sealed cordon, save upgrade).
7. The lab rework.
