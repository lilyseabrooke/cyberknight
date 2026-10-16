# CLAUDE.md

See [`AGENTS.md`](AGENTS.md) for the Next.js notes. The game engine is in `engine/`; the setting bible is in `docs/setting/`.

## Protocols

When the author's message begins with `PROTOCOL:`, follow the matching playbook exactly. Do not interview; the playbook already
encodes the design principles (maximal, unbalanced, multidimensional).

- **`PROTOCOL: new location`**: read [`docs/locations/PROTOCOL.md`](docs/locations/PROTOCOL.md) and run it straight through,
  concept to pushed commit, without stopping for approval.
- **`PROTOCOL: new location, review`**: the same, but post the concept pitch (step 1) as the whole reply and stop for
  approval; after approval, continue without stopping again.
- Text after a colon is the concept (`PROTOCOL: new location, review: a pawn shop`).

Always: typecheck and tests green before starting; commit to the session's designated branch; no PR unless asked.

## Design stance: feel over balance

The game is pre-alpha. **Feel trumps balance right now.** Imbalance, rough edges and design quirks are acceptable, and
often preferable to a sanded-down version that feels worse.

- Don't tune, rebalance or add guardrails for fairness unless the author asks. A dominant strategy, an overtuned number
  or an odd interaction is not a bug.
- Don't add or extend balance/Monte Carlo tests, and don't spend effort making existing ones pass.
- If something feels good but is lopsided, keep it and mention the imbalance in passing. Don't fix it unprompted.
- Do still fix real bugs: crashes, broken state, and rules that don't do what the code or docs say.

## Running tests

- Use `npm test` (about 40 s) for all routine verification, together with `npm run typecheck`.
- **Never run `npm run test:full` (or `vitest --mode full`) without asking the author first.** It takes about 22 minutes and
  adds only the Monte Carlo balance tests. Balance is not a concern at this stage (see "Design stance" above), so only raise it when there is a really
  good reason (e.g. you changed core simulation logic and `npm test` can't cover it), and say why when you ask.
- Never start vitest in watch mode (always `vitest run`, never bare `vitest`).
