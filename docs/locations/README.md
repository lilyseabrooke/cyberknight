# Locations

Kinds of place that are rolled from many independent axes and offer something to every kind of capability.

| File | What it is |
|---|---|
| [`PROTOCOL.md`](PROTOCOL.md) | How to add a new one, end to end. `PROTOCOL: new location` runs it; `, review` stops once at the concept. |
| [`TEMPLATE.md`](TEMPLATE.md) | The spec every location starts from |
| [`gym.md`](gym.md) | The worked example: the gym / dojo, implemented |
| [`pawn.md`](pawn.md) | The second location: the pawn shop (hock things, buy them back off the shelf), implemented |
| [`chop.md`](chop.md) | The third, and the smallest: the Chop Shop (a workbench behind a door: salvage, ammo, craft, upgrade on Tinkering), implemented |

Code: `engine/src/affordances.ts` (the shared row schema, registry and coverage), `engine/src/placekit.ts` (the machinery every place shares: `Check`, `Result`, `runCheck`), `engine/src/content/gym*.ts`, `engine/src/gym*.ts`, `engine/src/content/pawn*.ts`, `engine/src/pawn*.ts`, `engine/src/content/chops.ts`, `content/parts.ts`, `bench.ts`, `chop.ts`.
Tools: `npm run gyms`, `npm run pawns`, `npm run chops`, `npm run coverage`.
