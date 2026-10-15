# CYBERKNIGHT

A self-playing cyberpunk sword-and-sorcery roguelite. You're the lab assistant; your writing is the tinkering.

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Tone & voice: [`docs/TONE.md`](docs/TONE.md)

## Dev

```
npm install
npm run dev                    # the log UI at http://localhost:3000 (runs the engine in the browser)
npm test                      # engine unit tests
npm run typecheck
npm run play -- neo-7 0.2     # watch one night in Neo: <seed> <competence 0..1>
npm run sim -- 1000 0.1       # headless balance harness: <runs> <competence 0..1>
npm run analyze               # play lots of nights and report; --vs main compares with another version (docs/ANALYSIS.md)
```

The loop: Blackbird goes out, banks money at drop points around Neo, dies, and is rebuilt in the lab (a separate screen), where whatever made it into her account buys upgrades from a large set of skill trees. The browser keeps the save between visits.

Neo is built as she explores: the Rusty Halo district is hand-made, and everything past it is generated when she first gets there and kept in the save (`engine/src/mapgen.ts`).

`engine/` is pure, deterministic TypeScript (seeded RNG, no DOM). `app/` + `components/` are the Next.js log UI (no backend yet; Supabase saves/login come in M2).

## Deploying

Hosted on Vercel (framework preset: Next.js, Node 22). The production branch is `main`; every other branch and PR gets a preview deployment. No environment variables are required yet; Supabase keys will be needed once saves and login land.
