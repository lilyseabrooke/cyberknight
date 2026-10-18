# Places as boards

Every indoor place is a grid whatever she is doing there, and it is one grid: the same layout and the same people on it whether she is walking about, sneaking or fighting. Clubs are the first with a made layout; every other indoor place has a plain room of the right kind, and the streets (laid out on the hex grid) will get strips of their own. The city above is still the graph of locations and the hex grid under the streets; this is the layer below it.

## The layout (`layout.ts`)

A place's layout is worked out from its id and the world's seed alone, so it is the same every time and is never stored.

- **A club** (`isClub`) gets a made one, about 12 to 14 by 9 to 10 tiles: the **DJ booth** at the back with the decks behind it and a **speaker stack** either side; the **bar** down one side (the counter is cover; stools on the floor side, the bartender's side behind it) and **booths** down the other; a **dance floor** between, with pillars and a strobe, with the booths dark and the bar and the door bright.
- **Everywhere else indoors** gets a plain room (`plainLayout`): a board of the right kind for the place with a few lamps and dark corners and, in a dungeon, the machines that kind of room keeps (`content/props.ts`). A dungeon's rooms are seeded from the garrisoning too, so a re-garrisoned dungeon is a new set of rooms.
- Both give **a door tile for each visible exit** (the front way in first), each tied to the real exit it is; hidden exits have no door until found. Every walkable tile is reachable from the front door.
- A layout also hands back **fixtures** (named things with the tiles they take and the tiles someone stands on to use them), **zones** (behind the bar, the stools, the seats, the stage, the deck, the floor, the walls, by the door), the **light** and its **props**: machines an Override can set off, which in a club are the speaker stacks.

## What is on it (`placeboard.ts`)

`World.boards[place]` is the place's one board, for the run. It holds:

- where **she** is, and a coarse name for it (`door:<exit>`, `fixture:<id>`, `near:<person>`, `floor`);
- every **person present** as an entity (`Ent`): where they are, which way they face, where their post is, a patrol route if they walk one, and what they were last doing about her (`behavior`, `last`, `searched`, `calm`...). Dungeon garrisons are on it from the start, though they are not "here" for anything else in the game until they notice her;
- the **bodies**: who is down or dead, where they fell, and whether anyone has found them;
- the **props** and how many goes each has left, and the **darkened** patches.

Between scenes it is deliberately coarse and none of it is in the log:

- **Where anyone is, when no scene is on, is a function of the world clock** (`tickOf`: one tick per world minute, not per beat, so an hour-long odd job moves the room on far more than a word does) (`routeAt`, `walkRounds`, `slotOf`): nobody is stepped from beat to beat, so skipping ahead and watching every beat give the same answer. A round is a path between two tiles with a pause at each end (the pauses and a starting offset are fixed per person), and it comes round again every `patrolPeriod` minutes, so a patrol can be learned and timed. At an end they look about; walking, they face the way they go.
- In a club people have **stations** by what they are: the bartender works up and down behind the bar, security walk a round of the floor from the door, the DJ stays on the decks, and patrons move on to another spot (bar, floor, booth) every twenty to forty-five minutes, never onto each other or her.
- Elsewhere they stand scattered away from the doors, a guard on a post or walking a round. People who turn up in the middle of something (a mugging) start a few tiles from her and stay put.
- A scene can leave someone mid-search or mid-chase; after `RESUME` (10) quiet minutes they give it up and go back to their round (`standDown`).
- The fallen stay where they fell until they get up or are taken away.

She **arrives in the doorway** of the door she came in by (`relocate` calls `enterPlace`). Actions that need her somewhere put her there first (`positionFor`): chatting, flirting, kissing, threatening, arm wrestling and analyzing put her beside the person; pickpocketing, behind them; the DJ booth, the dance floor and settling a tab put her at those. She is not moved to start a fight. A long walk is mentioned now and then (`place_spot`), not every time.

## Shapes (`shapes.ts`)

A room is not always a rectangle. `shapeFor` draws a shape from the room's own dice (by kind of place, and a dungeon's `hall` is mostly a hall), so a plain room is exactly what it always was:

- **L** and **U**: part of the rectangle is outside the map (`void` terrain). Nobody can stand on it, and nothing is seen or shot through it; noise through it counts as through a wall.
- **hall**: a corridor along the middle with two or three rooms off each side, each reached by a doorway in its wall. The ways out are at the ends of the corridor.
- **inner**: a smaller room walled inside the larger one, with one door.

Doorways in interior walls (and the tiles beside them) are kept clear of furniture, and if a crate would seal anything off it is the crate that goes, not the wall. Cameras in the corners of an odd room go on the nearest tile that is on the map. Clubs are still rectangles. Big shaped rooms are bigger than the plain ones (7 to 12 tiles a side).

## The three ways of using it

- **Walking about** is the above.
- **Sneaking** (`prowl.ts`) plays the room round by round on this board: the layout, the people as they stand with the habits they have, the bodies, the machines, the darkness. `viewOf` builds the sneaking board as a view of it (the same grid, the same arrays for bodies, props and darkness, so what happens to them stays happened) and `commitBoard` writes back where she ended up and what everyone was doing. Someone she puts down comes off their feet and becomes a body.
- **Fighting** (`tactics.ts`) is played on a copy of the layout: she starts where she is, each foe where they are, the exits are the real doors. A shot taken from the doorway starts in the doorway with everyone a good way off and the door under her feet; one started at the bar starts at the bar with the bartender across the counter. In a place with fixtures it opens with a line saying where (`place_spot`). Afterwards everyone is where the fight left them and the fallen are bodies, already found. If she runs, she goes out by the door she reached, if it is one she could simply walk through; otherwise by the old fixed escape route.

So a sneak that goes wrong carries straight on into the fight from the same positions, and a body dropped in the dark is there when the shooting starts.

## Sight on the board

Who can see her is worked out from the board (`seesHer`, `camerasSeeHer`): a line across the room with nothing solid or `large` in the way, inside the person's cone (their facing, set when they were placed and swung a little each beat for those at posts), and for a camera inside its sweep. See `STEALTH.md`. A layout gives each room its cameras (`Layout.cams`) and marks the big things (`Grid.tall`, `Fixture.large`).

## Being seen

Pickpocketing asks who could actually see it (`spatialStir`): people facing her, near enough, in good enough light, with nothing in the way. Someone turned away or too far off does not notice. (In a place with no board, everyone in the room gets a little.)

## Not done yet

- Other places having more than a plain room: layouts with fixtures for bars, shops, homes, clinics, corp floors, gyms and pawn shops (gyms and pawn shops already have the rooms and features to build them from). Rooms of one venue (an upstairs lounge, restrooms) each get their own board but have no templates, and nothing crosses between boards: noise through a door, people following her through one.
- Sneaking in a club (it would run on the club's board with the speaker stacks as props, but nothing starts it there) and sneaking at all outside a dungeon.
- Crowds: only the people present are on the board; a crowd mass for the rest (blocks sight, counts as cover, supplies joiners) is not done.
- Streets as strips on the hex grid, with chases running across them.
- Fixtures doing more in a fight (the counter as cover is there; bottles, the jukebox and the speakers are not yet).

## Hours and crowds (`hours.ts`)

- A place can have **opening hours** (`Location.hours`, [open, close] in hours of the day; a close before the open runs past midnight). Clubs keep 20:00 to 06:00 by default; nothing else has any unless it sets its own. `isClosed` (shut for good or outside its hours) hides the door from her choices, keeps wanderers out, and sends the ones inside home (`placeAt`). If she is still inside when it closes she is shown out (`closing`, in `run.ts`).
- The **crowd** follows the hour (`crowdAt`, a curve per kind: a club is thin at eight, packed from eleven to one, near empty by five). Bystanders (`ephemeral`) are made in that proportion when a place is first looked at, and afterwards come and go with each stretch they spend somewhere.
