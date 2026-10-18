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
- **Dungeons**: sneaking, each of the garrison has a look as she enters and lingering lets awareness climb; walking in openly keeps the room's general watchfulness roll. Quests in `sneak` mode enter stealth; going loud ends it.
- **Fights** (`tactics.ts`): sneaking, a foe is only `alert` at the start if they already had a sense of her, so an unaware one can still be ambushed.
- **Dragons** notice more for a few beats after something loud (`noiseBoost`).

## Calling for help

An ordinary thing a foe can choose (the `call` technique in `techniques.ts`), weighed by `callWeight`: how outmatched they feel, what sort of crew they are, how many of their own are already here, how nervy they are, and whether they already called and nobody has lost her since (x0.1). Calling again is allowed once everyone has lost her and found her again. The old flat 22% backup roll is gone.

How it goes out depends on what they carry (`channelOf`): a **shout** (nearby allies Alert), a **communicator** (all allies Alert), or **optics** (all allies Aware). Allies at the fight turn up in a round or two. A sanctioned bout (`joiners: false`) calls no one.

**Hush** (a learnable Hack, `hush`) suppresses it for 25 beats. Normally they can still shout; a very good roll (the bottom fifth of her chance) silences them completely. Used on someone who has already called it changes nothing, and it never clears the "already called" memory. Out of a fight she can Hush a watcher with a link who hasn't got her yet.

## Not built yet

- Perception finding hidden things (hidden exits, enemy ambushers, traps) and the blur on what she reads off others at low Perception.
- Disappearing mid-fight (`slip` exists but no fight technique uses it), and stealth hacks that stay undetected.
- Listener behaviour beyond a nudge: police sent after her and dragons record the noise (`makeNoise`) but don't yet move to investigate.
- Allies elsewhere reached by a communicator go Alert but don't yet travel to her.
- Nobody teaches Hush yet, like the other learnable Hacks.
- Cover is derived from crowd, dark and weather; authored `Location.cover` is supported but nothing sets it.
