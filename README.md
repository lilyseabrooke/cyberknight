# CYBERKNIGHT

A self-playing cyberpunk sword-and-sorcery roguelite. You're the lab assistant; your writing is the tinkering.

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Tone & voice: [`docs/TONE.md`](docs/TONE.md)
- Setting bible & content guides: [`docs/setting/`](docs/setting/README.md) (read before adding content)

## Dev

```
npm install
npm run dev                    # the log UI at http://localhost:3000 (runs the engine in the browser)
npm test                      # fast engine tests (seconds); skips the slow Monte Carlo ones
npm run test:full             # everything, incl. the ~34 slow whole-game simulation tests (run before merging)
npm run typecheck
npm run play -- neo-7 0.2     # watch one night in Neo: <seed> <competence 0..1>
npm run sim -- 1000 0.1       # headless balance harness: <runs> <competence 0..1>
npm run districts -- demo 6     # roll random districts (vector-described, not labelled): <seed> <count> [archetype]
npm run analyze               # play lots of nights and report; --vs main compares with another version (docs/ANALYSIS.md)
```

The loop: Blackbird goes out, banks money at drop points around Neo, dies, and is rebuilt in the lab (a separate screen), where whatever made it into her account buys upgrades from a large set of skill trees. The browser keeps the save between visits.

Neo is built as she explores: the Rusty Halo district is hand-made, and everything past it is generated when she first gets there and kept in the save (`engine/src/mapgen.ts`). Some of what's out there is a dungeon: an Atlas outpost or a ganger hideout, with rooms, a garrison, traps and spoils at a difficulty of its own, which she raids on her own initiative and which fills up again a couple of runs after it's cleared (`engine/src/dungeons.ts`).

`engine/` is pure, deterministic TypeScript (seeded RNG, no DOM). `app/` + `components/` are the Next.js log UI (no backend yet; Supabase saves/login come in M2).

## Deploying

Hosted on Vercel (framework preset: Next.js, Node 22). The production branch is `main`; every other branch and PR gets a preview deployment. No environment variables are required yet; Supabase keys will be needed once saves and login land.

## Writing tests

Test an event by building it, not by hunting for it. `engine/src/testkit.ts` has the tools:

```ts
const s = scenario({ at: 'street_main', setup: (w) => { w.hero.cash = 200; } });
s.run((c) => vandalCops(c), never());          // rigged dice: never() fails every chance, always() passes them all, rolls(...) scripts them
expect(s.saw('vandal', 'fined')).toBe(true);   // takes milliseconds; s.do('key') runs an action the hero is offered; s.step(n) runs the real loop
```

Only claims about the whole simulation ("this turns up in real nights", "smart heroes last longer") should play whole
nights. Use `search({ want: [...], prefix, max })` for "keep playing until it turns up", and mark the test `slow`, so it
only runs under `npm run test:full`. Pair each such search with direct scenarios for the individual outcomes (see
"each outcome, built directly" in `engine.economy.test.ts`).

