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

- Gain per beat is `0.16 x profile x keenness`, with a little noise. `profile` is how noticeable she is (sneak skill, cover, a glowing implant, a vehicle); `keenness` is the observer's perception over 5. See `profile`, `coverAt`, `npcPerception`.
- **Losing her** (she leaves the room, or slips out of sight): they drop to Alert, stay at least Alert for 12 beats while they search, then fade by .03 a beat. `loseContact` is called from `relocate`.
- **Arrivals** start at 0 even in a room whose people already have her.
- Out of stealth nobody is tracked: `bucketOf` says everyone in her room is Aware.
- She can only read the small shifts if she's paying attention (Perception 4 or better for Suspicious); she trains Perception doing so and Sneak by staying unnoticed.

## Stealth is a mode

`hero.stealth`. She chooses it (`stealth:enter` is a candidate; pickpocketing and quiet jobs enter it themselves) and any action that isn't quiet ends it (`gate`, listed in `stealthActions`). A goal in `sneak` mode holds it all the way through.

**Going in with people watching** is decided by cover (0 to 1: the place, the crowd, a blackout, fog, a distraction): none and they all stay Aware, full and they all drop to Alert, otherwise each one rolls her stealth against their perception. Alert is always the floor. The same roll (`slip`) is meant for disappearing mid-fight.

## Where it is used

- **Witnessing** (`witness.ts`): out of stealth everyone in the room and every working camera sees an assault. Sneaking, the fight is a stir (`0.35 + 0.8 x noise`) and only the ones it tips into Aware saw it.
- **Planning** (`discretion.ts`): sneaking, exposure is how far along each watcher already is.
- **Pickpocketing**: only from someone below Alert. Out of stealth it needs cover to slip into stealth first. Their Perception pushes back on the roll, Suspicious makes it worse, and a hit brushes awareness up.
- **Dungeons**: sneaking into a room with people in it plays the room as a board (below). Walking in openly keeps the room's general watchfulness roll. Quests in `sneak` mode enter stealth; going loud ends it.
- **Fights** (`tactics.ts`): sneaking, a foe is only `alert` at the start if they already had a sense of her, so an unaware one can still be ambushed.
- **Dragons** notice more for a few beats after something loud (`noiseBoost`).

## The board (`prowl.ts`)

Sneaking into a dungeon room lays it out as a small grid (the same kind a fight is played on, seeded from the room so it is the same every visit that night) and plays it round by round until she has put everyone down, someone has her, or it stalls. The board is not drawn anywhere; it is told as a few lines in the log (`prowl_*` events).

- **Sight.** Each person has a facing and a cone (sensors have a wide one). Range depends on their Perception and on the light at her tile (dark, dim, lit). Per round a unit's awareness of her climbs by `0.3 x closeness x cone x how much she shows x light x her skill x keenness`. She shows least holding still (and not at all to anyone at range if she is behind cover), a little sneaking, fully walking, double dashing. Nobody gets a fix on her without actually seeing her.
- **Noise.** Everything she does makes some (`STEP_NOISE`, takedowns by weapon, a prop going off). Hearing falls off with distance, a wall takes some, and a sound they can make out is at least a reason to wonder: it sets where they go to look (`last`) but never gives a fix.
- **Their habits** by awareness: an Unaware sentry looks about from a post, or walks a short patrol and pauses at the ends; Suspicious goes to see; Alert searches from where it last had her and the tiles around it (behind cover first); turrets and officers turn but don't go anywhere. They settle after a few quiet rounds.
- **Her side** is a planner. For each tile she could reach it weighs how far from getting behind the one she wants against how much the room would see of her there, now and next round (it looks one step ahead at where patrols will be), and refuses a step that would tip anyone over. She waits for a patrol to turn its back, goes for whoever is easiest to reach unseen, and hides a body that someone could see.
- **Takedowns.** Adjacent, from behind best (front is much worse), better on someone who has noticed nothing, better in the dark, with her stealth against their Perception. Weapon decides kill or knock-out; either is quiet by its noise. A failure gives that one a fix and it is a fight. Takedowns take their cash, give XP, train Sneak, and leave a body that anyone who sees it goes Alert about, and may call.
- **Props and distractions** (`content/props.ts`). Rooms have things she can get into with an Override: a PA speaker, a terminal, a vending machine, a jukebox, a wall screen, a fuse box (which also darkens the area). Within six tiles, `overrideChance`; it makes a noise where it stands that draws whoever hears it (they go to look, without suspecting her; officers and turrets only turn). A fail pings softly. Charges are limited and persist for the night. Her planner uses one when the only way at someone is in their face and a lure would draw them off.
- **Going in.** At a dungeon's door she chooses quiet or loud by what she is like (thrill, courage, temper, justice, as for a job's style); quiet enters stealth, so the rooms inside are played as boards. A place she judges too much for her either way she still gives up on.
- **Hand-off.** If anyone has a fix the board stops and the existing alarm and fight take over. If she puts all of them down, the room is cleared (the dungeon is cleared if that was the last), with no heat. If it stalls she stays in the room unseen, as before.

## Calling for help

An ordinary thing a foe can choose (the `call` technique in `techniques.ts`), weighed by `callWeight`: how outmatched they feel, what sort of crew they are, how many of their own are already here, how nervy they are, and whether they already called and nobody has lost her since (x0.1). Calling again is allowed once everyone has lost her and found her again. The old flat 22% backup roll is gone.

How it goes out depends on what they carry (`channelOf`): a **shout** (nearby allies Alert), a **communicator** (all allies Alert), or **optics** (all allies Aware). Allies at the fight turn up in a round or two. A sanctioned bout (`joiners: false`) calls no one.

**Hush** (a learnable Hack, `hush`) suppresses it for 25 beats. Normally they can still shout; a very good roll (the bottom fifth of her chance) silences them completely. Used on someone who has already called it changes nothing, and it never clears the "already called" memory. Out of a fight she can Hush a watcher with a link who hasn't got her yet.

## Not built yet

- Sneaking on boards for places other than dungeon rooms: clubs now have a layout (see `BOARDS.md`) but the prowl board does not run on it yet.
- On the board: moving on through another exit (she only clears or stalls), Hush and camera Overrides, cameras at all, a fight that goes back to hiding mid-way, and the "evaded" result.
- The dungeon as an ecosystem: patrols between rooms, calls that make other rooms respond, defend or flee, a derived alert level (`d.alert` and `d.aware` still exist), and bodies being missed by roll call.
- Perception finding hidden things (exits, ambushers, traps), and the blur on what she reads at low Perception.
- Listener behaviour beyond a nudge: police sent after her and dragons record the noise (`makeNoise` in stealth.ts) but don't yet move to investigate.
- Nobody teaches Hush yet, like the other learnable Hacks.
- Cover is derived from crowd, dark and weather; authored `Location.cover` is supported but nothing sets it. On the board, light is a room-kind base with random lamps and dark corners.
