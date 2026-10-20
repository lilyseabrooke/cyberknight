# Writing a mission

A mission is one file in `engine/src/content/missions/` exporting a `MissionDef` (`missionkit.ts`), and one line in that folder's
`index.ts`. Read [`../MISSIONS_PLAN.md`](../MISSIONS_PLAN.md) first, and `safekeeping.ts` as the worked example.

## Shape it first

- **Small.** Four to seven stages. A beginning (the hook), something to earn, a fork, a payoff. Every stage is something she
  does at a place, or something the world does while she isn't looking.
- **Rolled, not written.** Cast, places, names, which variant a slot uses, the grades she plays against: all from the mission's
  stream (`roll(w, rng, m)`). Two runs of the same mission should be two different stories.
- **Uses what's there.** A stage that needs a break-in is a job (`Npc.quest`, quests.ts); a stage that needs money nests a
  `cash` goal; a face is a disguise; a fight is `fight()`. Write new machinery only when nothing fits.
- **Forks go to the lab.** One question per mission, at the moment that matters, with a `lean` from her traits.
- **Failure moves it.** A flop is a wait (`hold`) or another road, never a dead end. It only ends badly when people in it die
  or turn on her.
- **Unbalanced is fine.** Lopsided rewards, a villain road, a lucky break. Feel over balance.

## The definition

| Field | What it's for |
|---|---|
| `id`, `title`, `track` | The track (a skill id) decides which sets can bring it to her after a set |
| `entries` | `after_set`, `grapevine`, `object`: the chance each way in fires when its moment comes |
| `eligible(w)` | Could one start now: her name or skill for it, none already going, a rest since the last |
| `roll(w, rng, m)` | Spawn the cast (ids `m_<mission id>_<role>`, no colons), pick or grow the places (`pickPlace`, `addTrailPlace`), fill `picks` and `flags`. False if the world can't host it |
| `first`, `stages` | Stage keys in the order the story usually runs (the goal counts later stages as progress) |
| `stick` | Trait weights for how much she wants to see it through |
| `tokens(w, m)` | `{npc}` (the main person: pronouns follow them), places, names, numbers: every token a line uses |
| `hook(w, m, via)` | Lines for each way in, and `reminded` for a cast member bringing it back to a new body |
| `remembers` | Cast roles who bring it up with a body that doesn't know |
| `watch(c, m)` | Every beat, known or not: the world's side (somebody in it died) |
| `resolve(c, m, pick)` | A fork decided |

A `StageDef` has `label` (as a goal), `where` (the place it pulls her to), `candidates` (keys from `actKey`, so the mission
goal leans on them), `tick` (each beat while she knows of it) and `afterSet` (she just played somewhere).

## Lines

`tell(c, def, m, variant, outcome, lines, thoughts)`: field report and thought, per `docs/TONE.md`, with `{token}`s and pronoun
tokens (`{they}`, `{their}`, `{is}`) for `{npc}`. Use pronoun tokens, never "he" or "she", for generated people. A death of hers
is never admitted out loud. Add a song moment in `songs.ts` (`'mission:<variant>'`) for an ending worth a song.

## Tests

A test per road, with rigged dice (`always()`, `never()`): it rolls; each stage advances; each fork branch reaches the end; a new
body doesn't know it and the cast bring it up; and every line renders with a template and no token left unfilled.
