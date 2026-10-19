# Callings: the long game she carries

Status: **proposed, not started.** Written against the engine as of `ca5976d`. Per the "feel over balance" stance in
`CLAUDE.md`, every number here is a starting guess to be felt out. A Calling that bends her whole life around one idea
is the point, not a bug.

## What it is

A **Calling** is a long-term goal Blackbird sets for herself and expects to keep until she dies. She can have **at most
one**. It is not a task. It is a direction: it tilts what she does for fun, which goals she dreams up, which jobs look
good, who she picks fights with, and what her thoughts sound like. Almost no Calling is ever finished. Most are
interrupted by her death, and the lab's wall remembers which one.

Goals (`goals.ts`) are things she wants *this week*. A Calling is why she wants them.

```
Calling   "flatline 500 cops"          (one slot, sticky, steers the whole mind)
  Goal    kill Officer Brandt          (1 of many, made because of the Calling)
    Goal  buy a better weapon          (the usual nesting, unchanged)
```

## What already exists

- **`Mind.passion` + `CALLING` in `stage.ts` is a small, specific Calling already.** A big showing or a skill level lights
  her up ("become a beatbox legend"); `passionAfter` ignites it, a `level` rises and falls, and her fame goal turns into
  that skill's calling. It only covers five performance skills and it fades. This proposal is that idea made general.
  The five existing `CALLING` strings become the first five Callings, `passion.level` becomes `fervor`, and the `CALLING`
  export gets renamed so the word means one thing.
- **The goal machinery is the right host.** `goalBias` (added to every candidate's score), `formGoals` / `formIdle`
  (where new goals are born), `GoalSpec` + `adopt` (so a Calling spawns ordinary goals), `maybeAsk` (the lab tech can be
  consulted), and `stick` traits (what makes her cling to a goal).
- **Death is already the reset.** `Mind` is rebuilt with each body (`newMind()`), while `Legacy` (personality, deaths)
  survives. So a Calling stored on `Mind` dies with her for free, and the *personality* that picks it comes back each life.
- **Moments to hang sparks on:** the event stream (`companion_lost`, `skill_up`, `slight`, `passion`, fights, arrests),
  plus `Npc.memories`, `Mind.bonds` and `Mind.known`.

## The system

### State

```ts
interface Calling {
  id: CallingId;
  since: number;          // beat
  fervor: number;         // 0..1, how hard it has hold of her. Rises on progress and vivid moments, sags when nothing happens.
  progress: number;       // measured against `goal`, 0..1+ (can exceed it)
  goal: number;           // the finish line, rolled at adoption ("500 cops", but she might have said 150)
  target?: { npc?: Id; faction?: Id; loc?: Id; skill?: string; text?: string };   // who or what it is *about*
  origin: { kind: 'spark' | 'wound' | 'whim'; text: string; beat: number };
  sequel?: CallingId;     // set when it was born of another one finishing
}
Mind.calling?: Calling;
DeathRecord.calling?: { id; label; progress };   // the wall remembers what she died chasing
```

`goal` is rolled per adoption (not fixed per Calling) and scaled by her competence, so the same Calling can be a
modest 50 or a deranged 500. A bigger roll comes from a more extreme origin (a bigger wound, a vainer girl).

### Three ways to get one

All three only fire when she has **no** Calling, and never in the middle of a fight, chase or stealth scene (the check
runs after the beat resolves, in `mindAfter`, like `passionAfter`).

1. **Spark** (the usual route). A vivid moment makes her realise what she wants. Each Calling defines `sparks`: which
   events qualify and how strongly. Chance = `moment strength x trait fit`, with a floor so a total mismatch is nearly
   impossible. A great beatbox set from someone who already has the skill and some `artistry` is a spark for
   *beatbox legend*; the same set from a brute with no ear is not. Several Callings can compete for one moment and the
   weighted pick wins.
2. **Wound.** Something is taken from her. `companion_lost` carries who killed them and their faction. A lover leaving,
   a friend arrested, a beating by the same gang twice. This makes the vengeance family and sets `target` from the event.
   Wounds roll a bigger `goal` and a higher starting `fervor`.
3. **Whim** (rare, out of the blue). On an idle beat with nothing on her mind (the same slot `formIdle` uses), a tiny
   per-beat chance (about `0.0005`) picks a Calling weighted purely by traits. The log says so honestly: "no reason.
   She woke up sure."

A fourth, optional door: when a spark fires she may `maybeAsk` the lab tech ("I think this is it. Back me?"). Say no and it
goes on cooldown. This is the one place the player can influence it, and it is worth keeping because it makes the
moment legible.

### What a Calling does

All of it flows through machinery that already exists, so nothing new needs its own AI.

- **Candidate bias.** A `bias(fam, id)` per Calling, added in `goalBias` next to the goal terms, scaled by
  `fervor x focusFactor`. A beatbox Calling lifts `beatbox`, `beat_battle`, venues and stages; a cop-killer Calling lifts
  `challenge`, `threaten`, `go` toward NPD presence. Place pull rides the existing `hops`.
- **Goal generation.** Each Calling supplies a `suggest(c)` that returns `GoalSpec`s, offered as extra weighted options in
  `formGoals` / `formIdle`, with `why` set to the Calling ("it is what she is for"). Where possible these reuse existing
  goal kinds (`kill`, `fame` with `mode: skill`, `raid`, `heist`, `dragon`, `explore`, `romance`). New kinds only when
  nothing fits.
- **Stickiness.** Goals born from the Calling get lower decay and a lower frustration rate, and they are not dropped for
  `capacity`. A Calling-goal outranks a random whim, but remains softmax: she still gets distracted.
- **Appraisal.** `appraise` (quests) and `heistAppetite` / `raidAppetite` get a multiplier for work that fits. A
  cop-killer likes a flatline job on a precinct more.
- **Progress.** A `measure(w)` per Calling reads counters. A `fervor` bump comes on progress (+) and on setbacks that
  *feel* like the Calling (a bad loss at the thing she's chasing can raise it, not just lower it).
- **Voice.** New events: `calling` (adopted: spark / wound / whim variants), `calling_beat` (25 / 50 / 75 % lines),
  `calling_waver`, `calling_done`. Thoughts also pick up a Calling tag, so the same ambient line can be re-voiced
  ("another cop, another notch"). Tone per `docs/TONE.md`: she never doubts herself in-voice.
- **UI.** The status panel shows the Calling, its progress, and the origin line ("since Pip, run 3"). The lab wall shows
  what each past body died chasing.

### Wavering, finishing, sequels

- **Fervor drifts down** with long stagnation, but a Calling is never dropped by decay alone. At low fervor she
  *wavers*: the pull weakens and lines get quieter. At the bottom, after a long stretch with no progress and no
  vivid moments, a **crisis** can fire ("she doesn't remember why she wanted this"), after which the slot is empty and
  a new spark or whim is possible. This is the only way out besides finishing or dying. It should be rare and sad.
- **Impossible** (its target no longer exists, a faction is wiped out) is also a clean exit, usually into a sequel.
- **Finishing** is rare and loud: a unique event, a fame bump, a one-off boon. Then there is a good chance (about 60 %) of
  a **sequel**, a bigger or stranger Calling that grows out of it, rather than an empty slot.
- **Switching** isn't allowed. A new spark during a Calling can deepen it (fervor up) or be ignored, but never replaces it.

### Persistence across lives (optional, not in the first cut)

`Mind` resets per body, so the Calling dies with her. But the *personality* persists, so the same Blackbird will tend to
pick similar Callings each life, which already feels like fate. A cheap extension is for the previous body's Calling
to nudge the next life's weights (up, as an echo, or down, as relief). Park this until the base system feels good.

## The first set

Format: **Calling**, how she says it, what sparks it, what she does about it, what finishes it, and which traits make it
likelier. "Needs counter" marks anything the engine doesn't yet track.

### Spotlight (the existing five become the first five)

| Calling | Line | Spark | Does about it | Finish | Traits |
|---|---|---|---|---|---|
| **Voice of Neo** | "become a superstar vocalist" | big karaoke / serenade / gig, vocals level-up | vocals acts, fame goals, stages | fame + shows won | artistry, fame |
| **Guitar legend** | "become a guitar legend" | great jam / guitar duel, level-up | guitar acts, buskers, gig venues | wins + fame | artistry |
| **Top DJ** | "become Neo's top DJ" | a dancefloor she moved | `dj_set`, club residencies | headline sets | artistry, sociable |
| **Beatbox legend** | "beatbox so well the city is never the same again" | a really good beatbox moment | `beatbox`, `beat_battle`, battles, crowds | battle wins | artistry, impress |
| **Cover Neo in her art** | "cover Neo in her art" | a graffiti piece that lands | graffiti on new walls / districts | pieces across districts (needs counter) | artistry, mischief |

### Violence and justice

| Calling | Line | Spark | Does about it | Finish | Traits |
|---|---|---|---|---|---|
| **Flatline N cops** | "flatline 500 cops" | arrested / beaten / shaken down; a bystander cuffed; a *wound* if the NPD kills a companion | picks fights with NPD, `kill` goals on named officers, raids precincts | N NPD flatlined (needs per-faction kill counter) | temper, justice, grudge |
| **Break a gang** | "end the Chrome Vipers" (target picked) | a jump by them, a companion lost to them, a long feud | `kill` goals on members, raids their dens | their dungeons cleared + leaders dead | grudge, courage |
| **Avenge a name** | "make [killer] pay for [Pip]" | *wound*: a named companion or lover is killed | hunts the specific killer; `kill` goal with no cooldown | the killer flatlined | loyalty, grudge, romantic |
| **Put every dragon down** | "put every cyberdragon in the ground" | a near-death dragon fight survived; a rescue from one; seeing one hit a crowd | `dragon` goals, `challenge_dragon`, patrol loitering | `dragon_kills` over N (counter exists) | courage, justice, thrill |
| **Guardian of the block** | "nobody gets hurt on my streets" | a rescue that goes well; a witnessed mugging she was too late for | intervenes in bystander trouble, escorts, rescues | N rescues / quiet streets (needs counter) | kindness, justice |
| **Topple Atlas** | "burn down the board" (rare) | an Atlas shutdown of something she loved; a board-level insult | board-facing raids and dragons; anything that costs Atlas | the endgame; rare | justice, fame, courage |

### Take and own

| Calling | Line | Spark | Does about it | Finish | Traits |
|---|---|---|---|---|---|
| **The score of the century** | "pull the biggest heist Neo has ever seen" | an enormous haul; walking away from a vault she couldn't crack | `heist` goals at ever-bigger sites, casing | one tier-top vault (or a total take) | greed, thrill |
| **The ghost** | "be the girl nobody ever caught" | a clean stealth takedown; slipping out past a patrol | stealth over force, burgle, takes the quiet route even when loud works | N clean entries with no alert (needs counter) | techy, mischief |
| **Best kit in Neo** | "have the best chrome and iron in the city" | a great implant or a weapon that humbles her | `buy` goals, implants to `MAX_IMPLANTS`, raiding for loot | full implants + top-grade weapon | vanity, greed, techy |
| **Own the net** | "there's nothing I can't hack" | a spectacular hack or override | `hack`, billboards, cameras; techy quests | N hacks / overrides (`billboard_hacks` exists) | techy, curiosity |

### Heart and hearth

| Calling | Line | Spark | Does about it | Finish | Traits |
|---|---|---|---|---|---|
| **The One** | "find the one and keep her" | a great date; a heartbreak | `romance` goals, but chooses fewer people more carefully | a long-running `together` bond | romantic |
| **Heartbreaker** | "be the girl every girl in Neo remembers" | a night that went very well | `romance` goals, constantly, with impress acts | distinct girls kissed (`kisses_` exists) | impress, vanity |
| **Crew nobody can break** | "build a crew that never loses anyone" | a companion joining; a rescue of one | recruits, keeps companions alive, avoids risky fights with them along | slots full for N days (counter) | loyalty, kindness |
| **A puppy for every stray** | "every stray in Neo gets a home" | bonding with a robot puppy | `steal_puppy` (it exists), rescues strays | N rehomed (counter) | animal, kindness |

### Body, wheels, and the rest of Neo

| Calling | Line | Spark | Does about it | Finish | Traits |
|---|---|---|---|---|---|
| **Strongest in Neo** | "be the strongest person in Neo" | a win in the gym pit; being beaten by someone obviously stronger | gym, `armwrestle`, `challenge` on tough NPCs | gym rank / bouts won (counters partly exist) | courage, temper |
| **Roof-runner** | "no one catches me, ever" | a spectacular escape on foot | `parkour`, takes roofs, chases for fun | N escapes (needs counter) | thrill, reckless |
| **Road legend** | "fastest thing on the street" | a great getaway; a motorcycle moment | bikes / cars, getaways, drive-bys | races won / getaways (needs counter; see `MOTORCYCLES_PLAN`) | thrill, reckless |
| **Hustle every table** | "clean out every pool hall in Neo" | a pool or darts win with money on it | `pool`, `darts`, bar games across the map | N tables fleeced | gamble, mischief |
| **Drink Neo dry** | "have a drink in every bar in Neo" | a legendary night | bar-hopping, `buy_round`, tolerates the consequences | N bars (counter) | drink, sociable |
| **See it all** | "see every street in this city" | stumbling on somewhere secret | `explore`, ever further from home | fraction of the map seen | curiosity |
| **Cook for Neo** | "make Neo's best noodles" | a meal that goes over well | `cook`, stalls, ingredients | dishes served (counter) | appetite, sociable |

That is 27, enough to cover the traits without repeating, and several are deliberately small and silly (the tone doc's
whole joke is the gap between how big she thinks it is and how big it is). A Calling doesn't have to be grand to be a Calling.

## Sequels

Finishing, or being made impossible, can hand off:

- **Avenge a name** done -> **Flatline N cops** / **Break a gang** (the killer's faction) at about 50 %. Revenge teaches her
  the shape of the problem.
- **Break a gang** done -> **Topple Atlas** (rare), or **Guardian of the block**.
- **Voice of Neo** (any performance Calling) done -> a rarer bigger form ("sing in front of the board").
- **Heartbreaker** done, or disillusioned -> **The One**. **The One** lost -> **Avenge a name** if it's death, else **Heartbreaker**.
- **Crew nobody can break**, after a companion dies anyway -> **Avenge a name**. A quiet tragedy engine.

## Build plan

1. **Core.** `engine/src/callings.ts` (hooks and bookkeeping) and `engine/src/content/callings.ts` (the table). Types in
   `types.ts` (`Calling`, `Mind.calling`, `DeathRecord.calling`). Add `mindAfter` hook (sparks + progress), a `mindTick`
   hook (wavering, whim, finishing), a `goalBias` term, and one `formGoals` / `formIdle` branch. Save version bump with a
   migration in `universe.ts` (existing `Mind.passion` -> `Mind.calling`).
2. **Migrate `passion`.** Fold `passion` into the five spotlight Callings; keep `passionBias` behaviour as the
   `bias()` for them. Rename the `CALLING` export in `stage.ts` (e.g. `PERFORMANCE_LINES`) and keep one source of truth.
3. **First vertical slice:** the five spotlight Callings plus **Flatline N cops** + **Avenge a name**, since between them
   they exercise all three origin routes, a targeted Calling, a sequel, and a bias that has to find a hostile faction.
   Needs: per-faction kill counters; `companion_lost` carrying the killer.
4. **Text.** `calling` event variants for spark / wound / whim, milestones, waver, done; Calling-tagged thoughts.
5. **Lab and UI.** Status panel readout, death-wall line, optional `maybeAsk` door.
6. **The rest** of the table, in whatever order is most fun, with counters added as each needs them.

Tests per the repo stance: fast unit tests that the slot holds one, a spark adopts the right Calling, a Calling adds bias,
death clears it. No balance or Monte Carlo tests.

## Open questions

- **Should the lab tech be able to nudge or bless a Calling?** Currently only the optional "back me?" ask. A cipher-spend
  to *plant* one would be a very different, probably stronger, relationship between player and hero.
- **Does Calling progress ever carry over a death?** Proposed: no. The record on the wall is the only trace, with the
  echo extension above as an optional later hook.
- **How loud can a Calling get?** The stance says leave it lopsided: a hard-pulled cop-killer will path-find to the
  NPD all day. If it feels too railroaded, `fervor x focusFactor` is the single dial. Not tuning it until it's played.
