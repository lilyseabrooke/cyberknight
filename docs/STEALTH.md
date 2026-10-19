# Stealth

One system instead of a roll in every place that cares whether she was seen. Code: `engine/src/stealth.ts`; tests: `stealth.test.ts`.

## Awareness

While Blackbird sneaks, everyone who could notice her (a person, a drone, a dog, a dungeon's garrison, a camera) carries an
**awareness** of her from 0 to 1 (`Npc.aware`; cameras keep it on the location, `Location.camAware`). It climbs while she's in view and falls when she isn't. Four buckets:

| Bucket | Value | Means |
|---|---|---|
| Unaware | under .25 | no idea she is there |
| Suspicious | .25 up | something is wrong; they stop, turn, may look |
| Alert | .5 up | she is here somewhere; they don't know where |
| Aware | .75 up **and a fix** | they know where she is |

- Gain per beat, for those who can see her (a line on the board, and near enough to make her out in that light), is `0.16 x profile x keenness`, with a little noise. Those who can't see her gain nothing, and anyone who had a fix on her loses it and drops to Alert. People at their posts look about as the beats go by (a quarter turn each way), and those on a round walk it by the clock (`BOARDS.md`), so where she can stand unseen changes in a way she can learn and time. `profile` is how noticeable she is (sneak skill, cover, a glowing implant, a vehicle); `keenness` is the observer's perception over 5. See `profile`, `coverAt`, `npcPerception`.
- **Losing her** (she leaves the room, or slips out of sight): they drop to Alert, stay at least Alert for 12 beats while they search, then fade by .03 a beat. `loseContact` is called from `relocate`.
- **Arrivals** start at 0 even in a room whose people already have her.
- Out of stealth nobody is tracked: `bucketOf` says everyone in her room **who can see her** is Aware. Seeing is a line on the room's board *and* being inside their cone (`seesHer` in `placeboard.ts`): somebody behind a wall, or behind something big, or with their back turned, isn't, whatever room it is. Right beside her they always are; a loud thing (a gunshot, a brawl) makes them turn, so only the line matters then. Where a place has no board to say (the streets), it's everyone in the room.
- She can only read the small shifts if she's paying attention (Perception 4 or better for Suspicious); she trains Perception doing so and Sneak by staying unnoticed.

## Stealth is a mode

`hero.stealth`. She chooses it (`stealth:enter` is a candidate; pickpocketing and quiet jobs enter it themselves) and any action that isn't quiet ends it (`gate`, listed in `stealthActions`). A goal in `sneak` mode holds it all the way through.

**Going in** only matters for the ones who can see her: those who can't never knew she was there, so nobody-can-see-her needs no cover at all. **Going in with people watching** is decided by cover (0 to 1: the place, the crowd, a blackout, fog, a distraction): none and they all stay Aware, full and they all drop to Alert, otherwise each one rolls her stealth against their perception. Alert is always the floor. The same roll (`slip`) is meant for disappearing mid-fight.

## Where it is used

- **Witnessing** (`witness.ts`): out of stealth everyone who can see her and every working camera sees an assault. Sneaking, the fight is a stir (`0.35 + 0.8 x noise`) and only the ones it tips into Aware saw it.
- **Planning** (`discretion.ts`): sneaking, exposure is how far along each watcher already is.
- **Pickpocketing**: only from someone below Alert. Out of stealth it needs cover to slip into stealth first. Their Perception pushes back on the roll, Suspicious makes it worse, and a hit brushes awareness up.
- **Dungeons**: sneaking into a room with people in it plays the room as a board (below). Walking in openly keeps the room's general watchfulness roll. Quests in `sneak` mode enter stealth; going loud ends it.
- **Fights** (`tactics.ts`): sneaking, a foe is only `alert` at the start if they already had a sense of her, so an unaware one can still be ambushed.
- **Dragons** notice more for a few beats after something loud (`noiseBoost`).

## The board (`prowl.ts`)

Sneaking into a dungeon room plays it round by round on the room's one board (`BOARDS.md`): the same layout, people and bodies the fight and the walking-about use, so what a sneak does to the room is there afterwards. The board is not drawn anywhere; it is told as a few lines in the log (`prowl_*` events).

- **Sight.** Each person has a facing and a cone (sensors have a wide one). Range depends on their Perception and on the light at her tile (dark, dim, lit). Per round a unit's awareness of her climbs by `0.3 x closeness x cone x how much she shows x light x her skill x keenness`. She shows least holding still (and not at all to anyone at range if she is behind cover), a little sneaking, fully walking, double dashing. Nobody gets a fix on her without actually seeing her.
- **Noise.** Everything she does makes some (`STEP_NOISE`, takedowns by weapon, a prop going off). Hearing falls off with distance, a wall takes some, and a sound they can make out is at least a reason to wonder: it sets where they go to look (`last`) but never gives a fix.
- **Their habits** by awareness: an Unaware sentry looks about from a post, or walks a short patrol and pauses at the ends; Suspicious goes to see; Alert searches from where it last had her and the tiles around it (behind cover first); turrets and officers turn but don't go anywhere. They settle after a few quiet rounds.
- **Her side** is a planner. For each tile she could reach it weighs how far from getting behind the one she wants against how much the room would see of her there, now and next round (it looks one step ahead at where patrols will be), and refuses a step that would tip anyone over. She waits for a patrol to turn its back, goes for whoever is easiest to reach unseen, and hides a body that someone could see.
- **Takedowns.** Adjacent, from behind best (front is much worse), better on someone who has noticed nothing, better in the dark, with her stealth against their Perception. Weapon decides kill or knock-out; either is quiet by its noise. A failure gives that one a fix and it is a fight. Takedowns take their cash, give XP, train Sneak, and leave a body that anyone who sees it goes Alert about, and may call.
- **Props and distractions** (`content/props.ts`). Rooms have things she can get into with an Override: a PA speaker, a terminal, a vending machine, a jukebox, a wall screen, a fuse box (which also darkens the area). Within six tiles, `overrideChance`; it makes a noise where it stands that draws whoever hears it (they go to look, without suspecting her; officers and turrets only turn). A fail pings softly. Charges are limited and are kept on the room's board for the night. Her planner uses one when the only way at someone is in their face and a lure would draw them off.
- **Going in.** At a dungeon's door she chooses quiet or loud by what she is like (thrill, courage, temper, justice, as for a job's style); quiet enters stealth, so the rooms inside are played as boards. A place she judges too much for her either way she still gives up on.
- **Hand-off.** If anyone has a fix the board stops and the existing alarm and fight take over. If she puts all of them down, the room is cleared (the dungeon is cleared if that was the last), with no heat. If it stalls she stays in the room unseen, as before.

## Cameras

Cameras are bolted up in the layout (`Layout.cams`: corners first, then the middles of the walls, as many as the place has) and turn a little either way as they go (`camFacing`), so each covers one slice of the room at a time. A camera has her only if she is in its slice at that moment, near enough (it sees further than a person and is less fooled by the dark) and nothing big is in the way; crouched behind a crate it doesn't. `camerasSeeHer` says whether any working camera does: a Blackout takes cameras down in order, a power cut all of them. Witnessing, the per-beat gain on the cameras (`Location.camAware`) and planning all use it, and the sneaking board counts the cameras in what a tile costs and in whether she is about to be caught, so she routes round their cones and times her moves to the sweep. Where there is no board (the streets) any working camera counts, as before.

## Big things

Some of what stands in a room is big enough to hide behind and some is not. A fixture or a cover tile can be `large` (`Grid.tall`): a speaker tower or a pillar in a club, and some of the rest of any room's cover; a crate, a table, the bar and the DJ booth are not. A big thing blocks sight (and shots, since a line is a line) without being a wall, so even a room with no interior walls has somewhere to stand unseen.

## Height

Where a board has levels (see `BOARDS.md`), sight has a height: from higher ground you see over walls and big objects that stop people on the ground, and from the street you cannot see onto a platform past its edge. Roofs are good places to watch from and hard places to be seen on.

## Calling for help

An ordinary thing a foe can choose (the `call` technique in `techniques.ts`), weighed by `callWeight`: how outmatched they feel, what sort of crew they are, how many of their own are already here, how nervy they are, and whether they already called and nobody has lost her since (x0.1). Calling again is allowed once everyone has lost her and found her again. The old flat 22% backup roll is gone.

How it goes out depends on what they carry (`channelOf`): a **shout** (nearby allies Alert), a **communicator** (all allies Alert), or **optics** (all allies Aware). Allies at the fight turn up in a round or two. A sanctioned bout (`joiners: false`) calls no one.

**Hush** (a learnable Hack, `hush`) suppresses it for 25 beats. Normally they can still shout; a very good roll (the bottom fifth of her chance) silences them completely. Used on someone who has already called it changes nothing, and it never clears the "already called" memory. Out of a fight she can Hush a watcher with a link who hasn't got her yet.

## Not built yet

- Sneaking on boards for places other than dungeon rooms: every indoor place has a board now (see `BOARDS.md`) and the sneak runs on any of them, but nothing starts one outside a dungeon.
- On the board: moving on through another exit (she only clears or stalls), Hush and camera Overrides, cameras at all, a fight that goes back to hiding mid-way, and the "evaded" result.
- The dungeon as an ecosystem: patrols between rooms, calls that make other rooms respond, defend or flee, a derived alert level (`d.alert` and `d.aware` still exist), and bodies being missed by roll call.
- Perception finding hidden things (exits, ambushers, traps), and the blur on what she reads at low Perception.
- Listener behaviour beyond a nudge: police sent after her and dragons record the noise (`makeNoise` in stealth.ts) but don't yet move to investigate.
- Nobody teaches Hush yet, like the other learnable Hacks.
- Cover is derived from crowd, dark and weather; authored `Location.cover` is supported but nothing sets it. On the board, light is a room-kind base with random lamps and dark corners.

## Slipping away while they search

Stealth isn't only for getting in. When people are looking for her and don't have a fix on her (Alert, no fix), the street's own board plays
as a **leave** scene: `viewOf(..., { goal: 'leave' })` marks every real door/mouth as a way off the board (`Board.ways`), and `planLeave`
scores her moves by distance to the nearest way, exposure, and how near anyone is. Reaching a way ends the scene as `evaded`; she is
relocated to the neighbouring street and whoever was looking is left looking at an empty street.

- `streetHunt` (`streethunt.ts`) runs this for `gang_hunt` (gangers she's angered): she starts somewhere along the street (not in a doorway),
  they start Alert with no fix. If one spots her, it hands off: a foot chase if the nearest is 4+ tiles away, otherwise a fight.
- The mirror case: timid units (`timid()` in `prowl.ts`: patrons, shopkeepers, kids, etc.) who reach Alert/Aware don't come for her; they
  walk to the nearest way and leave (`prowl_flee`). Fleeing units don't count as "detected".

### Going to ground in a chase

On foot, a chase's `lose_them` can end with her off the line instead of out of the street: `outsFrom` offers a `cover` out (a dark tile or one
beside cover, 1–4 tiles off the line; ranked after doors, mouths, ways up and fences). She goes to it and holds still, and `passBy` runs each chaser
along the line from where it is to well past her, summing `sightGain` against her at `hold` posture. If anyone gets enough, they have her
(gap 1, the chase goes on); if not, `runPast` has them carry on to the street's far exit, Alert with no fix, and she is left on the street
in stealth (`hid`).

### Losing sight in a chase

Two rounds with nobody able to see her no longer ends the chase outright. They go to the tile where they last had her (`lastSeen`) and look
from there (`seesFrom`): if she's in view, the chase is on again (`chase_search:found`). If not, each chaser guesses for themselves
(`hideGuess`: more doors, alleys, ways up and dark corners near that spot means more likely she stopped to hide). A chaser who guesses
"hiding" gives up the chase (`Chaser.off`) and searches the street from there (`leaveSearching`); one who guesses "running" carries on after
her, a little behind for the hesitation. All of them searching ends the chase as escaped; a split sends some after her and leaves some behind.

### People on the line

On foot, whoever is standing on the chase line tiles she covers this round (`inTheWay`, up to two) is dealt with before the stumble roll: if there's
room beside the line she weaves round (a small loss of ground), otherwise she shoves through (`stepAside` moves them off the line, affinity down),
and a failed roll is a proper `bump` with the usual hurt/angry/heat results (angry bystanders join the chase). Foot chasers lose a little ground to
anyone still on the line behind her. Told with `chase_crowd` (weave, shove); the random bump roll still happens too.

Charm: each person on the line may simply make way for her (`clamp(0.06 * (charm - 2))`, times 0.4 for police and security), with no cost, no affinity loss
and no anger; they then close up behind her (`chase_crowd:ranks`), costing every pursuer 0.6 of gap per person who did. A charmed shove loses no
affinity, and a charmed bump never makes anyone angry.

### Takedowns happen wherever people haven't seen her

The takedown is not a special case of any one scene. In `plan()`, whatever she is doing (clearing a room, slipping out, keeping still), if anyone is in
melee range and hasn't seen her (not Aware, `sightGain` under 0.05) and nobody *else* is about to (`nearlyCaught`, ignoring the target), she takes them
(`takedown`: its own odds by arc, light and skill; knockout or kill; the noise goes round the board and may make others look). Going to ground in a
chase is the same scene: `hideScene` puts the street's board up with her in her corner and the pursuers as `runner` units following the line a tile a
round, not looking, until something reaches them (a sight or a noise raises their awareness) and they stop and look about. Goal `hide` has her hold still
and take whoever comes within reach. Whoever has her at the end is `seen` (the chase goes on), whoever ran on has `gone` (off the street), whoever
stopped to look is `left` (searching), whoever she put down is `down`. Bodies stay on the board.

### Tracking

A new skill (`tracking`, in the stealth group; spills into perception and streetwise) and `tracking.ts`. Chases now stay chases out to 30 tiles of gap
(`ESCAPE_GAP`, was 14) and run 12 rounds by default (was 8). When somebody loses their target, they roll to follow the trail: their tracker rating
(`trackerOf`: tracking, int, +1 police, +2 robots; hers is `heroTracker`) against how well it was covered (`coverOf`/`heroCover`: sneaking, how tight and
crowded the street is, and more if she hid). The result is a trail, `none`, `cold`, `warm` or `hot`.

- **Lost sight** (two rounds unseen): warm trackers rarely guess she hid, hot ones never do; they know she kept running.
- **Out of range** (gap at 30): instead of the chase ending, anyone who picks up the trail keeps it, with the gap pulled in to 85 %, 65 % or 45 % of that
  distance by how specific it is (`BEHIND`), told as `chase_track`. Three tries per chaser per chase. For her chasing them, the same, with tracking
  trained each time.

### Searchers on the board

When a chase ends with some of them left looking for her on the street she is hiding on (fanned out after losing sight, or stopped to look during a hide
scene), `runChase` hands them to `streetHunt` (`noSearch` stops that nesting): the same scene as a gang hunt, with her where she hid and them where they
were left, Alert with no fix. She slips off toward a way out, takes whoever comes into reach unseen, or is found (a chase with `noSearch`, or a fight).
Searchers in a hunt can track her (`Board.tracking`, `hunch` in `prowl.ts`): every third round a searching unit rolls tracker against her cover (more if she
is holding still or in the dark) and gets a new place to look: within a tile (hot), four (warm) or roughly her way (cold). Told once per unit as `prowl_track`.

### Escape fatigue

Searches can now start further chases, which can end in further searches, so running wears everyone down instead: `World.chaseTire` counts the rounds spent running
across chases and the hunts between them (one per chase round, one per hunt scene; `tracking.ts`: `tire`, `addTire`, `rest`). After six rounds each round
carries a `standTired` chance, 3.5 % per round beyond that up to 70 %, that whoever has been running longest stops and stands: she turns round
(`chase_mount:hero_stands`, the chase ends as caught and the fight follows) or, when she is chasing, a runner adds it to their chance to stop. A fight, a win
or a wreck ends the running (`rest`), and so do eight beats of quiet.

### Noise helps the tracker

Once they have lost her, whatever noise she makes thins her cover (`eased` in `tracking.ts`: 5 points off per unit of noise, up to 6). In a hunt, each searcher
keeps a running total of her noise that reached them (`PUnit.heard`, from `makeNoise`, so distance, walls and how keen their ears are all count) and spends
it on their next hunch. In a chase, once nobody can see her (`lost`), each round adds what she is doing to `loud` (0.3 running on foot, 0.45 in a car, 0.45 or 0.7
flat out, 0.6 for blows or ramming, 1 for shooting), which eases the check when sight is lost and when the gap runs out; being seen again resets it.

Ambient noise (`ambientNoise` in `tracking.ts`, 0 to 1): traffic and crowd on a street (`trafficAt`, so it follows the hour), +0.3 on a highway, +0.15 rain outdoors;
indoors 0.2 plus the music (club 0.7, bar 0.45, gym 0.35) and a crowd. How much of her noise carries to a tracker is `carries(ambient)`, from 1.6 in dead
silence to 0.4 in a din, applied to the noise that adds to `PUnit.heard` and to a chase's `loud`.

### Bystanders react (`bystanders.ts`)

Each round of a chase, up to two people within seven tiles of her who have not yet had their say (anyone on the street board who isn't one of the pursuers, her
companions, a robot, dragon or boss) pick a reaction once, by who they are and how they feel about her: **scatter** (the timid and the unnerved step off
the line), **point** (only once the pursuers have lost her: the ones who dislike her, and the law, tell them which way she went, which counts as noise to the
tracker), **trip** (affinity -15 or worse: she loses ground), **help** (affinity 15 or better, and Charm: the pursuers lose ground), **film** (fame +1),
**call** (the law always, others sometimes: starts a countdown for a patrol, see below), or nothing. Told as `chase_bystander`. Not yet: reactions to takedowns and
bodies in stealth scenes (those people are not units on the board), or to a chase that she is the one running after.

### A call brings a patrol (`callins.ts`)

A bystander who calls it in doesn't know what is going on, so there is no heat. It starts a countdown (3 to 6 rounds; 2 or 3 if the caller is law; another call
shortens it). If the chase is still going when it runs out, two officers arrive (NPD, or Atlas troopers on corp premises) and pick a side by `weighSides`:
**against her** (more with her heat with that force, and more when the pursuers are police or corp security), **against the pursuers** (more when they are
muggers or gangers, and when her heat is low), **against everyone** (a little always, more with heat, more for Atlas: she and the pursuers are both shot at),
or **ignore it**. Against her they join the chase on foot; against the pursuers, most of them are stopped for a while; they then go on. Told as `chase_police`.

### Witnesses in stealth scenes (`witnesses.ts`)

`viewOf` now also puts everyone else on the board who is only a person into `Board.others`: not targets, not part of the "has she been seen" test, but they can see.
When she takes someone down, up to three of them who can see her (or the victim) have seen it: they become Aware of her and react by the same weights as to any
assault (`pickReaction` in `witness.ts`): flee (off the board), call the police (heat +1, Atlas on corp premises), film (fame), shun or cheer (affinity), or
step in (hostile, and the scene ends as detected with them in `ProwlOpts.joined`, who join the fight). A body that one of them finds is not about her, because they
don't know who did it: most run, the rest shout, which alerts everybody on the board who is looking for trouble to where it is. Told as `prowl_witness`.
Takedowns on the hide scene in a chase use the same code.
