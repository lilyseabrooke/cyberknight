# Analysis harness

`npm run analyze` plays a few hundred nights of Blackbird at several competence levels and reports how the game is doing: how nights end, how many goals she finishes, where the time goes, how she dies, what she earns, how famous she gets, how much heat she draws. It can run the same experiment on another version of the code and say what changed.

```
npm run analyze                                  # 100 nights at competence 0.2, 0.6 and 1.0
npm run analyze -- --vs main                     # ... against what is on main
npm run analyze -- --vs 71e6e38 --nights 300     # ... against any git ref, with more nights
npm run analyze -- --competence 1 --only goals,deaths
npm run analyze -- --json out.json               # the raw per-night numbers
```

Flags: `--nights N` (default 100), `--competence a,b,c` (default `0.2,0.6,1`), `--seed prefix`, `--vs <git ref>`, `--only sections`, `--json file`, `--jobs N` (parallel workers, default one per core).
Sections: `outcomes goals movement money fame heat romance deaths`.

## How it works

`scripts/analyze/collect.ts` plays each night with `createRun` and `step`, and boils it to one flat record of numbers (`Night`). `scripts/analyze/stats.ts` has the statistics. `scripts/analyze.ts` runs one worker process per (version, competence) pair, in parallel, and prints the report.

With `--vs REF`, the harness makes a throwaway `git worktree` of that ref (with this repo's `node_modules` linked in), imports *that* checkout's engine to play the same seeds, and removes the worktree afterwards. The harness itself always comes from the tree you are standing in, so you can measure refs that predate it. Anything the old engine does not have (a newer event, weapon ratings) just counts as zero. "This tree" means the working tree, uncommitted changes included.

## Reading it

- Every number is a per-night mean with a standard error (`± ...`) when run alone.
- Compared, you get `base → now`, the change, and a mark. **▲/▼ means the change is bigger than about two standard errors of the difference.** `~` means it isn't distinguishable from noise. Green is better, red is worse, yellow is information (neither is better or worse).
- Runs use the same seeds on both sides, but as soon as anything changes how much random numbers get used, the nights diverge, so treat them as independent samples. Roughly: 100 nights a side can see a 10 to 15 point swing in a rate like "dies"; 300 can see 5 to 8. If it matters, run more nights. Several of the reversals chased during development were 100-night noise.
- Competence levels behave very differently. Look at all three before deciding anything.

## What to look at when

| you changed | look at |
|---|---|
| combat, weapons, police | `outcomes` (dies, first 20 beats), `deaths`, `heat` |
| goals, pursuits, idle behaviour | `goals` (done per 100 beats, no goal at all, by kind), `movement` |
| hustles, shops, money | `money` (hustles by type, bounties, cash) |
| performing, fame | `fame` (callings lit, fame, crowd-tired moments) |
| romance | `romance`, and `deaths` for jealousy |

Beats per night can go *up* because she survives longer, which also raises most per-night counts. Prefer the "per 100 beats" lines when comparing versions where night length changed.
