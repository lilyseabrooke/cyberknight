# Locations

Kinds of place that are rolled from many independent axes and offer something to every kind of capability.

| File | What it is |
|---|---|
| [`PROTOCOL.md`](PROTOCOL.md) | How to add a new one, end to end. `PROTOCOL: new location` runs it; `, review` stops once at the concept. |
| [`TEMPLATE.md`](TEMPLATE.md) | The spec every location starts from |
| [`gym.md`](gym.md) | The worked example: the gym / dojo, implemented |
| [`pawn.md`](pawn.md) | The second location: the pawn shop (hock things, buy them back off the shelf), implemented |
| [`chop.md`](chop.md) | The third, and the smallest: the Chop Shop (a workbench behind a door: salvage, ammo, craft, upgrade on Tinkering), implemented |
| [`hub.md`](hub.md) | The hacker hub: where Hacks and Overrides are taught (seven routes), including the Titanware Training Academy, implemented |
| [`studio.md`](studio.md) | The recording studio: takes that outlive her hands, royalties, the backing track, the ghost guitarist, the dragon broadcast; the first of the music venues (shared machinery in `content/venues.ts`, `venuekit.ts`), implemented |
| [`cutting.md`](cutting.md) | The cutting room: musical duels in rounds (`duel.ts`), the house title, guitars on the line, gangs that adopt her, implemented |

Code: `engine/src/affordances.ts` (the shared row schema, registry and coverage), `engine/src/placekit.ts` (the machinery every place shares: `Check`, `Result`, `runCheck`), `engine/src/content/gym*.ts`, `engine/src/gym*.ts`, `engine/src/content/pawn*.ts`, `engine/src/pawn*.ts`, `engine/src/content/chops.ts`, `content/parts.ts`, `bench.ts`, `chop.ts`, `engine/src/content/hub*.ts`, `engine/src/hub*.ts`.
Tools: `npm run gyms`, `npm run pawns`, `npm run chops`, `npm run hubs`, `npm run venues -- <kind>`, `npm run coverage`.
