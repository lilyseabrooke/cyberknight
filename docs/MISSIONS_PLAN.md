# Missions: small stories she follows

Status: **built**: the framework and the first mission, *Safekeeping*. Feel over balance: every number is a first guess.

## As built

| Piece | Where |
|---|---|
| A mission is a definition: cast roles, places, stages, ways in, the traits that make her stick with it, and its own lines. Rolled fresh on its own stream (`mission:<seed>:<id>`), so it's the same story in the same save and a different one in another | `missionkit.ts` (`MissionDef`, `StageDef`, helpers), `content/missions/` |
| The runtime: start one, tell her, make it a goal; each beat run the stage; a fork goes to the lab; it ends with an `ending` | `missions.ts` |
| The `mission` goal: pulls her to the stage's place (nothing while the stage is waiting), leans on the stage's own candidates, never frets while a stage is on hold or carried by another goal | `goals.ts`, `missions.ts` (`missionWhere`, `missionMetric`, `missionVerdict`) |
| Ways in: after a good set in front of people (`missionAfterSet`), the grapevine (`missionGrapevine`, from `grapevineTick`), a thing in a box at a bar, club or pawn shop (`mission_relic`, one per place) | `missions.ts`, `fans.ts`, `goals.ts` (`mindAfter`) |
| Forks: `maybeAsk(c, 'mission', ...)` with options that carry `{ id, pick }`; answered by the lab (`advise`) or lapsed to her `lean`, both land in `resolveMissionPick` | `advice.ts`, `missions.ts` |
| Death: the mission is on `legacy.missions` and outlives her; `Mind.missions` (what she knows) doesn't. A new body picks it up only when a cast member in `remembers` sees her (35% a beat), or through `remindMission(c, id, via)`, the hook for the Holocall layer | `missions.ts` |
| Lines: event `mission`, which carries its own `text` and `thought` (like the gym's), plus `goal_new/done/resume:mission` and `advice_ask/taken:mission`. Song moments for the endings | `text.ts`, `songs.ts` |
| Places that grow the city to meet the story: `addTrailPlace` (a bar, club or shop at the end of a trail of new streets) | `mapgen.ts` |
| *Safekeeping* (below) | `content/missions/safekeeping.ts` |
| Tests | `missions.test.ts` |

## The idea

The Guitar plan is a catalogue: doors that open for a good player, with no storyline holding them together. Missions are the
storylines, small ones, and lots of them. Each is a few stages long, uses the systems that already exist (jobs, bookings, Muse,
fans, disguises, fights), and is rolled differently every time. *Safekeeping* is the first and the model for the rest. Missions
are not a track: the first ones hang off Guitar (`track: 'guitar'`, which also decides which sets can bring one), and anything
can happen in one.

**She runs it herself.** Nothing takes the wheel. The mission is a goal like any other: it pulls, she wanders off, comes back,
gets hurt and puts it on hold, gets distracted by a Cyberfrog. The player's say is one lab question per mission, at the fork.

**The world's, not hers.** Blackbird doesn't remember a past life, but people remember her. A mission survives her death at the
stage it reached, with its people waiting; a new body has no idea. Until the Holocall layer exists to reach her, a mission left
behind sits in that halfway place: still there, but she's unlikely to pick it back up unless she happens across someone in it.

## Safekeeping

A retired guitar legend (generated: name, gender, age 58-84, their old band, their guitar's name, how many years since) has not
played since Muse Clearance took their guitar "for safekeeping".

| Stage | What happens |
|---|---|
| hook | After a set ("you play like {npc} used to"), the grapevine ("{npc} still drinks at {bar}"), or a signed setlist in a box |
| find | The master drinks at a new bar two or three streets off. She plays for them (a guitar roll against grade 12-18; no guitar, a borrowed one). Flop: "come back when you can play", a world day |
| earn | Rolled per mission: three **lessons** on different visits (big guitar training), fixing the **amp** (tinkering), or **busking** under the window twice. Then the master tells her about the guitar |
| fork | The lab question: **the lockup**, **the Muse setlist**, or **the collector**. Unanswered, her nature picks (thrill, justice and courage for the lockup; honesty, or a Muse contract, for the setlist; a pocket that can pay for the collector) |
| annex | The master's job (quests.ts): an NPD seized-goods truck at the end of new streets. Taking it while signed to Muse is a breach (`breach_annex`) |
| legal | The Muse Approved Setlist at the master's bar, in front of a Clearance witness (grade 18-24): Muse's pull there goes up. Flop it twice and it's auctioned: on to the collector |
| collector | A collector somewhere expensive with a price (250-650): buy it (haggling helps; short, she nests a cash goal) or lift it (sleight; caught, a fight). A dead collector's collection goes to evidence: on to the lockup |
| deliver | Take it to the master. If she loses it (it died with her body), Clearance has it again: on to the lockup |
| lastset | Tomorrow evening at the club the master last played. The master comes to watch. A guitar roll against grade 26-34 on their guitar (a little help). Flop: "it's not ready for you", another night |
| endings | **kept** (vanity and greed: a signature guitar with their name on it), **returned** (kindness and loyalty: the master plays the last song; more fame and fans), **mourned** (the master died some other way) |

**The darker road.** From the fork on, at the master's side, she can turn on them: rare, a mood (low kindness, mischief, greed,
temper). A bar fight only knocks people down, so she finishes it. Then **usurp**: at the venue she goes on as the master
(`wearStar`: a famous face, with the star rules: their heat, a scandal if it comes apart), back after all those years.
Clearance hands the guitar back to its "rightful owner" at the stage door. Acting holds the face, guitar holds the room:
**usurped** (the guitar, money, a song), **exposed** (somebody knew the master; half the venue's fans walk), or a flop and another
night. If the master survives her, **betrayed**: that's the end of it.

## Writing the next one

See [`missions/TEMPLATE.md`](missions/TEMPLATE.md). In short: a file in `engine/src/content/missions/`, a line in its `index.ts`,
a test in the style of `missions.test.ts`.

## Not yet

- **Holocall**: people getting in touch with a body that doesn't know (`remindMission` is ready for it).
- More missions, and missions that share cast: a master from *Safekeeping* turning up in somebody else's story.
- Booking the last set as a real `Booking` (with the door waving her through) instead of the mission's own stage.
