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
