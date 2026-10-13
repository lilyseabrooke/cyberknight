# CYBERKNIGHT

A self-playing cyberpunk sword-and-sorcery roguelite. You're the lab assistant; your writing is the tinkering.

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Tone & voice: [`docs/TONE.md`](docs/TONE.md)

## Dev

```
npm install
npm test                      # engine unit tests
npm run typecheck
npm run sim -- 1000 0.1       # headless balance harness: <runs> <competence 0..1>
```

`engine/` is pure, deterministic TypeScript (seeded RNG, no DOM). The web app (Next.js + Supabase on Vercel) comes in M2.
