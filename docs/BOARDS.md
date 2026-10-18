# Places as boards

Every place is meant to be a grid whatever she is doing there: a fight, a sneak, a drink, a pool game. Clubs are the first, as the proof of concept (`layout.ts`, `placeboard.ts`). The city above is still the graph of locations and the hex grid under the streets; this is the layer below it.

## Layout (`layout.ts`)

A place's layout is worked out from its id and the world's seed alone, so it is the same every time and is never stored. A club gets a room of about 12 to 14 by 9 to 10 tiles:

- the **DJ booth** at the back with the decks behind it and a **speaker stack** either side;
- the **bar** down one side (the counter is cover; stools on the floor side, the bartender's side behind it), **booths** down the other;
- the **dance floor** between, with a couple of pillars, lit by a strobe, with the booths dark and the bar and door bright;
- a **door tile for each visible exit** (the front doors on the south wall, the others where they fit), each tied to the real exit it is. Hidden exits have no door until they are found.

It also hands back **fixtures** (named things with the tiles they take and the tiles someone stands on to use them), **zones** (behind the bar, the stools, the seats, the stage, the deck, the floor, the walls, by the door) and the light. Every walkable tile is reachable from the front door; tests check this over many generated clubs and the Neon Pharaoh.

## What moves (`placeboard.ts`)

`World.boards[place]` holds, for the run only: where she is, a coarse name for it (`door:<exit>`, `fixture:<id>`, `near:<person>`, `floor`), and where each person present is and which way they face.

- Between scenes it is deliberately coarse. People are put at **stations** by what they are (the bartender behind the bar, the DJ on the decks, security by the door, the rest on the floor, at the bar or in the booths) and every few beats some patrons drift to another. Nobody walks about; none of this is in the log.
- She **arrives in the doorway** of the door she came in by (`relocate` calls `enterPlace`).
- Actions that need her somewhere put her there first (`positionFor`, once per action in `step`): chatting, flirting, kissing, threatening, arm wrestling and analyzing put her beside the person; pickpocketing puts her behind them; the DJ booth, the dance floor and settling a tab put her at those. She is not moved to start a fight: a fight starts from where she stands.
- A long walk is mentioned now and then (`place_spot`, variant `walk`), not every time.

## Fights

A fight in a place with a layout is played on that layout (`Sim` takes the board): she starts where she is, each foe where they were, and the exits are the real doors. So a shot taken from the doorway starts in the doorway, with everyone still at their stations a good way off and the door under her feet, while a fight started at the bar starts at the bar with the bartender across the counter. It opens with a line saying where (`place_spot`, variant `fight`). Afterwards everyone is where the fight left them. If she runs, she goes out by the door she reached, if it is one she could simply walk through; otherwise by the old fixed escape route.

## Being seen

Pickpocketing in a club now asks who could actually see it (`spatialStir`): people facing her, near enough, in good enough light, with nothing in the way. Someone turned away or too far off does not notice. (Outside a club, everyone in the room gets a little, as before.) This uses the same sight cones as the dungeon board.

## Not done yet

- Other places. Bars, shops, homes, clinics, corp floors, gyms and pawn shops still use a random board per fight; their layouts and fixtures are the next step, and gyms and pawn shops already have the rooms and features to build them from.
- Sneaking in a club (the prowl board running on a club layout, with the speaker stacks as Override props) and one board shared between a stealth approach and the fight that follows.
- Crowds: only the people she can see are on the board; a crowd mass for the rest (blocks sight, counts as cover, supplies joiners) is not done.
- Streets as strips on the hex grid, with chases running across them.
- Fixtures doing more in a fight (the counter as cover is there; bottles, the jukebox and the speakers are not yet).
