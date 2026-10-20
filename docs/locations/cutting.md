# Location spec: Cutting Room

**Status:** IMPLEMENTED (see "What was built"). Numbers are starting points, not tuned (CLAUDE.md, "feel over balance").

## 0. Decided

- **Concept** (from the guitar-track location proposals, approved): a place to find out who is better, in rounds, in public. It
  brings the biggest new mechanic of the set, a **musical duel engine** (`duel.ts`), and the "gang doors" of `GUITAR_PLAN.md` §1
  (the Rust Choir's call-and-response gate, Neon Marrow's floor, the Saint Sixers' hymn).
- **Shape:** a **lot** on the shared music-venue machinery (`content/venues.ts`, `venuekit.ts`).

## 1. How the three principles shape it

| Principle | In practice |
|---|---|
| Maximalism | 9 variants × 12 shells × sizes, conditions, tiers × 0-3 of 30 traits × 16 situations × 8 wild cards; 43 features; 11 duel moves, 8 foe styles |
| Unbalanced | the stranger at the crossroads plays for her hands (lose and her skill in it is gone; win and it jumps); a won title stays hers on the place until someone takes it; a gang adoption is for good |
| Multidimensional | 55 rows over 30 skills; the duel itself draws on guitar, singing, DJing, beatboxing, dancing, speaking, intimidation, perception, analysis, sleight and tinkering, by move |

## 2. Concept

Muse decides what music is allowed. The cutting room decides what music is *good*, by asking a crowd, loudly, in rounds. For a
guitarist it is a ring; for a hustler it is a book; for a thief it is a tin under the host's desk and a wall of losers' guitars; for a
flirt it is a crowd that has come to pick a side. Atlas is a decibel poster and the man on the talent-show panel who only votes for
jingles.

## 3. The duel (`duel.ts`)

A duel is up to five rounds (seven for a title). Each round she picks a **move** and the foe picks one from their **style**; each side
rolls its grade (hers is the move's skills, weighted, mostly the duel's own skill, plus the guitar's tone and volume) plus a spread,
plus a **matchup** (a slow burn takes the wind out of a shred; a stolen lick turns a show-off's best moment against them; a
call-and-response beats a hymn). The winner of a round moves the crowd a step (two for a rout); three steps and it's over, otherwise
whoever has the crowd after the last round wins, and a dead heat goes to the louder guitar. A heckle that lands takes 10 off their
next round; a pulled plug (sleight, tinkering) either wins the round outright or disqualifies her. A sharp Blackbird plays the
matchup; a careless one plays what her drives like (pride shreds, curiosity steals licks, lust plays the slow burn).

Moves: riff, shred, slow burn, stolen lick, call-and-response, heckle, pulled plug, floor-filler, drop, beat, hymn. Styles:
shredder, blues player, caller, floor-filler, hymn singer, heckler, beatboxer, machine.

## 4. The room (`content/cuttings.ts`, `cutting.ts`)

- **Variants (9):** battle-of-the-bands hall, Rust Choir scrapyard (guitar; call-and-response gate; the Choir adopts), Neon Marrow
  floor-off (DJing; the floor-filler is loved), Saint Sixers hymn-off chapel (singing), corporate talent night (singing; Muse
  watches; the golden buzzer), old-timers' blues room, robot battle ring (a robot champion on a stolen LUMINA build), basement cypher
  (beatboxing), busker's underpass.
- **Keep (rolled once):** the house champion's grade and style, the entry fee; later the title holder, the house record, the losers'
  wall.
- **Bouts** (`cut_<skill>:...`, all performance acts judged like a set):

| Bout | What it does |
|---|---|
| **open** | a challenger off the board (about half the champion's grade, the same every time): the fee in, a purse out, fame |
| **champ** | the house champion, best of seven: the title is hers (`keep.holder`), the room's fans, a Muse scout's offer if one is in |
| **defend** | holding the title, once a night a challenger comes for it; lose and the title goes to them |
| **wager** | guitars on the line: win a rolled guitar off the wall; lose her best instrument to it |
| **gate** | at a gang's yard, an answer to the caller: three wins at a gang's rooms and the gang adopts her (`legacy.adopted`): its heat goes to 0 and its people spawn 25 points warmer, everywhere, for good |
| **royale** | (wild card) eight on one stage: four quick duels in a row, everything to the last one standing |
| **crossroads** | (wild card) the stranger plays her for her hands |

## 5. People

A host (owner), the house champion (or the house robot), a judge, challengers, punters, a bouncer; gangers at a gang's room; a Muse
A&R scout at a talent night or a scouted room; off-duty cops (trait); the stranger (wild card).

## 6. Rows (`content/cuttingafford.ts`, `content/cuttingevents.ts`)

55 rows: the pit, a stage dive, warming up, studying the champion (their grade drops), working out the scoring, the sound desk,
tending bar, drinking with the losers, the merch table, the wall of names (her own, from a past life), the jukebox, noodles; working
the crowd, a flirt, autographs, trash talk, a drink with the champion, running a book, the losers' card table; loosening the
champion's valve, a guitar off the losers' wall, pockets, the entry tin, a brawl, the back door, stims; a tournament, a grudge bet,
playing for the Muse scout, an acoustic blackout set, a raid turned hymn practice, mentoring a rookie, stopping a gang fight, the
documentary, the owner's birthday duel (lose on purpose), a heatwave, dancing in a flood, talking her way into an empty title; her
tribute act teaching her her own riffs, her old rival, lifting the golden plectrum, LUMINA on the panel, the silent duel; the scrap
drums, welding onto the wall, the glowing floor, a sermon, the confessional, the golden buzzer, green-room gossip, hacking the robot,
the cypher circle, the hat war, judging a bout, the crane.

## What was built

As above. `duel.ts` is general: any module can call `runDuel(c, foe, { skill, event })`. Not yet wired to it: the existing bar
`guitar_duel`, Muse shows' `crash_show`, LUMINA, or gang hideout doors (open: an adopted gang's hideout could let her walk in).

Real runs (60 autonomous runs): a cutting room was in reach in 17 and she walked into one in 3; fresh bodies have little to duel with,
and the doors open at 18:00. Inside, the rows and the bouts score well (a beatbox title bout tops the menu at a cypher).

Numbers to watch: the champion's grade (`10 + 9 × tier`, more for a legend or a robot), the title's best-of-seven, the crossroads'
+120 XP or zero, the gang adoption at three wins.
